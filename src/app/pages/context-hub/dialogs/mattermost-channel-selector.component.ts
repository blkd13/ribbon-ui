import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatListModule } from '@angular/material/list';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { MatExpansionModule } from '@angular/material/expansion';

import {
  ApiMattermostService,
  MattermostTeam,
  MattermostChannel,
  MattermostTimeline,
  MattermostTimelineService,
  Preference,
} from '../../../services/api-mattermost.service';
import { ChatService } from '../../../services/chat.service';
import { ToolCallService } from '../../../services/tool-call.service';
import { of, forkJoin } from 'rxjs';
import { catchError, switchMap, tap, map } from 'rxjs/operators';

export interface MattermostSelection {
  sourceType: 'channel' | 'timeline';
  teamId: string;
  teamName: string;
  channelIds?: string[];
  channelNames?: string[];
  timelineId?: string;
  timelineName?: string;
}

interface TeamWithCount extends MattermostTeam {
  channelCount?: number;
}

interface TimelineWithChannels extends MattermostTimeline {
  channelDetails?: MattermostChannel[];
  isExpanded?: boolean;
}

@Component({
  selector: 'app-mattermost-channel-selector',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatListModule,
    MatTabsModule,
    MatTooltipModule,
    MatChipsModule,
    MatBadgeModule,
    MatExpansionModule,
  ],
  template: `
    <div class="mattermost-selector-wide">
      <!-- タブ切り替え (横並び小さめ) -->
      <div class="mode-tabs">
        <button type="button" class="mode-tab" [class.active]="tabIndex === 0" (click)="tabIndex = 0; onTabChange()">
          <mat-icon>tag</mat-icon> チャンネル
        </button>
        <button type="button" class="mode-tab" [class.active]="tabIndex === 1" (click)="tabIndex = 1; onTabChange()">
          <mat-icon>view_timeline</mat-icon> タイムライン
        </button>
      </div>

      <!-- チャンネル選択モード -->
      @if (tabIndex === 0) {
        <div class="three-column-layout">
          <!-- 左: チーム一覧 -->
          <div class="teams-column">
            <div class="column-header">
              <span class="column-title">カテゴリ</span>
              <span class="column-count">{{ teams.length + (dmChannels.length > 0 ? 1 : 0) }}</span>
            </div>
            <div class="search-box">
              <mat-icon>search</mat-icon>
              <input type="text" placeholder="検索..." [(ngModel)]="teamSearchQuery" (input)="filterTeams()">
            </div>
            <div class="team-list custom-scroll custom-scroll--thin">
              @if (isLoadingTeams) {
                <div class="loading-inline"><mat-spinner diameter="20"></mat-spinner></div>
              } @else {
                <div class="team-item" [class.active]="selectedTeamId === 'all'" (click)="selectTeam('all')">
                  <mat-icon class="team-icon">public</mat-icon>
                  <span class="team-name">すべて</span>
                  <span class="badge">{{ totalChannelCount }}</span>
                </div>
                @for (team of filteredTeams; track team.id) {
                  <div class="team-item" [class.active]="selectedTeamId === team.id" (click)="selectTeam(team.id)">
                    <mat-icon class="team-icon">groups</mat-icon>
                    <span class="team-name">{{ team.display_name }}</span>
                    <span class="badge">{{ team.channelCount || 0 }}</span>
                  </div>
                }
                <!-- ダイレクト・グループメッセージ -->
                @if (dmChannels.length > 0 || groupChannels.length > 0) {
                  <div class="team-divider"></div>
                  @if (dmChannels.length > 0) {
                    <div class="team-item" [class.active]="selectedTeamId === '__dm__'" (click)="selectTeam('__dm__')">
                      <mat-icon class="team-icon dm-icon">person</mat-icon>
                      <span class="team-name">ダイレクト</span>
                      <span class="badge">{{ dmChannels.length }}</span>
                    </div>
                  }
                  @if (groupChannels.length > 0) {
                    <div class="team-item" [class.active]="selectedTeamId === '__group__'" (click)="selectTeam('__group__')">
                      <mat-icon class="team-icon group-icon">group</mat-icon>
                      <span class="team-name">グループ</span>
                      <span class="badge">{{ groupChannels.length }}</span>
                    </div>
                  }
                }
              }
            </div>
          </div>

          <!-- 中央: チャンネルグリッド -->
          <div class="channels-column">
            <div class="column-header">
              <span class="column-title">CHANNELS</span>
              <span class="column-count">{{ getDisplayedChannelCount() }}</span>
            </div>
            <div class="search-box">
              <mat-icon>search</mat-icon>
              <input type="text" placeholder="チャンネル検索..." [(ngModel)]="channelSearchQuery" (input)="filterChannels()">
            </div>
            <div class="channel-grid-area custom-scroll">
              @if (isLoadingChannels) {
                <div class="loading"><mat-spinner diameter="28"></mat-spinner><span>読み込み中...</span></div>
              } @else if (displayChannelGroups.length === 0) {
                <div class="empty-state"><mat-icon>inbox</mat-icon><p>チャンネルがありません</p></div>
              } @else {
                @for (group of displayChannelGroups; track group.teamId) {
                  <div class="channel-group">
                    <div class="group-header">{{ group.teamName }}</div>
                    <div class="channel-chips">
                      @for (channel of group.channels; track channel.id) {
                        <label class="channel-chip" [class.selected]="isChannelSelected(channel)">
                          <input type="checkbox" [checked]="isChannelSelected(channel)"
                                 (change)="toggleChannel(channel, $any($event.target).checked)">
                          <mat-icon class="channel-icon">{{ getChannelIcon(channel) }}</mat-icon>
                          <span class="channel-name" [matTooltip]="channel.display_name || channel.name">
                            {{ channel.display_name || channel.name }}
                          </span>
                        </label>
                      }
                    </div>
                  </div>
                }
              }
            </div>
          </div>

          <!-- 右: 選択済み -->
          <div class="selected-column">
            <div class="column-header">
              <span class="column-title">SELECTED</span>
              <span class="column-count selected-count">{{ selectedChannels.length }}</span>
            </div>

            <!-- AI選択アシスト -->
            <div class="ai-assist-section">
              <div class="ai-input-row">
                <mat-icon class="ai-icon">auto_awesome</mat-icon>
                <input type="text"
                       [(ngModel)]="aiQuery"
                       placeholder="AIで選択（例: 開発関連のチャンネル）"
                       (keydown.enter)="executeAiSelect()"
                       [disabled]="isAiProcessing">
                @if (isAiProcessing) {
                  <mat-spinner diameter="16"></mat-spinner>
                } @else if (aiQuery) {
                  <button type="button" class="ai-send-btn" (click)="executeAiSelect()" matTooltip="AIで選択">
                    <mat-icon>send</mat-icon>
                  </button>
                }
              </div>
              @if (aiError) {
                <div class="ai-error">{{ aiError }}</div>
              }
            </div>

            <div class="selected-list custom-scroll custom-scroll--thin">
              @if (selectedChannels.length === 0) {
                <div class="empty-hint">
                  <mat-icon>touch_app</mat-icon>
                  <p>チャンネルを選択してください</p>
                </div>
              } @else {
                @for (channel of selectedChannels; track channel.id) {
                  <div class="selected-item">
                    <mat-icon class="channel-icon">{{ getChannelIcon(channel) }}</mat-icon>
                    <div class="selected-item-info">
                      <span class="channel-name">{{ channel.display_name || channel.name }}</span>
                      @if (getSelectedChannelTeamName(channel)) {
                        <span class="channel-team">{{ getSelectedChannelTeamName(channel) }}</span>
                      }
                    </div>
                    <button type="button" class="remove-btn" (click)="removeChannel(channel)">
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                }
              }
            </div>
            @if (selectedChannels.length > 0) {
              <button type="button" class="clear-all-btn" (click)="clearAllChannels()">
                <mat-icon>clear_all</mat-icon> 全てクリア
              </button>
            }
          </div>
        </div>
      }

      <!-- タイムライン選択モード（展開式デザイン） -->
      @if (tabIndex === 1) {
        <div class="timeline-layout-v2">
          @if (isLoadingTimelines) {
            <div class="loading"><mat-spinner diameter="28"></mat-spinner><span>読み込み中...</span></div>
          } @else if (timelinesWithChannels.length === 0) {
            <div class="empty-state large">
              <mat-icon>view_timeline</mat-icon>
              <p>タイムラインがありません</p>
              <span class="hint">Mattermost画面でタイムラインを作成してください</span>
            </div>
          } @else {
            <div class="timeline-list">
              @for (timeline of timelinesWithChannels; track timeline.id) {
                <div class="timeline-item" [class.selected]="selectedTimelineIds.includes(timeline.id)">
                  <div class="timeline-header" (click)="toggleTimelineExpand(timeline)">
                    <div class="timeline-header-left">
                      <mat-icon class="expand-icon">{{ timeline.isExpanded ? 'expand_more' : 'chevron_right' }}</mat-icon>
                      <div class="timeline-icon">
                        <mat-icon>view_timeline</mat-icon>
                      </div>
                      <div class="timeline-info">
                        <div class="timeline-title">{{ timeline.title }}</div>
                        <div class="timeline-meta">{{ timeline.channels.length }} チャンネル</div>
                      </div>
                    </div>
                    <button type="button" class="select-btn"
                            [class.selected]="selectedTimelineIds.includes(timeline.id)"
                            (click)="selectTimeline(timeline); $event.stopPropagation()">
                      @if (selectedTimelineIds.includes(timeline.id)) {
                        <mat-icon>check_circle</mat-icon> 選択中
                      } @else {
                        <mat-icon>radio_button_unchecked</mat-icon> 選択
                      }
                    </button>
                  </div>
                  @if (timeline.isExpanded) {
                    <div class="timeline-channels">
                      @if (timeline.channelDetails && timeline.channelDetails.length > 0) {
                        @for (ch of timeline.channelDetails; track ch.id) {
                          <div class="timeline-channel-item">
                            <mat-icon class="ch-icon">{{ getChannelIcon(ch) }}</mat-icon>
                            <span class="ch-name">{{ ch.display_name || ch.name }}</span>
                            @if (getChannelTeamName(ch)) {
                              <span class="ch-team">{{ getChannelTeamName(ch) }}</span>
                            }
                          </div>
                        }
                      } @else {
                        <div class="loading-channels">
                          <mat-spinner diameter="16"></mat-spinner>
                          <span>チャンネル情報を読み込み中...</span>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .mattermost-selector-wide {
      width: 100%;
      min-width: 900px;
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    /* モードタブ */
    .mode-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      flex-shrink: 0;
    }

    .mode-tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid var(--border-color, #3a3f4a);
      background: transparent;
      color: var(--text-secondary, #8b929a);
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;

      mat-icon { font-size: 18px; width: 18px; height: 18px; }

      &:hover {
        background: var(--bg-hover, rgba(255,255,255,0.05));
        color: var(--text-primary, #fff);
      }

      &.active {
        background: var(--primary-color, #1a73e8);
        border-color: var(--primary-color, #1a73e8);
        color: white;
      }
    }

    /* 3カラムレイアウト - 親要素の高さに合わせる */
    .three-column-layout {
      display: grid;
      grid-template-columns: 200px 1fr 240px;
      gap: 1px;
      background: var(--border-color, #3a3f4a);
      border: 1px solid var(--border-color, #3a3f4a);
      border-radius: 8px;
      overflow: hidden;
      flex: 1;
      min-height: 0;
    }

    /* カラム共通 - Finderスタイル: 各カラムが独立スクロール */
    .teams-column, .channels-column, .selected-column {
      background: var(--bg-dark, #1e2128);
      display: flex;
      flex-direction: column;
      overflow: hidden; /* カラム自体はスクロールしない */
      min-height: 0; /* flexbox内でスクロールを効かせるために必要 */
    }

    .column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: var(--bg-card, #282c34);
      border-bottom: 1px solid var(--border-color, #3a3f4a);
    }

    .column-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary, #8b929a);
      letter-spacing: 0.5px;
    }

    .column-count {
      font-size: 11px;
      color: var(--text-muted, #666);
      background: var(--bg-input, rgba(255,255,255,0.08));
      padding: 2px 8px;
      border-radius: 10px;
    }

    .selected-count {
      background: var(--primary-color, #1a73e8);
      color: white;
    }

    /* 検索ボックス */
    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      margin: 8px;
      background: var(--bg-input, rgba(255,255,255,0.05));
      border-radius: 6px;

      mat-icon { font-size: 16px; width: 16px; height: 16px; color: var(--text-muted, #666); }

      input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: var(--text-primary, #fff);
        font-size: 12px;

        &::placeholder { color: var(--text-muted, #666); }
      }
    }

    /* チームリスト - カラム内スクロール */
    .team-list {
      flex: 1;
      min-height: 0; /* 重要: flexboxでスクロールを効かせる */
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.3) transparent;

      &::-webkit-scrollbar { width: 6px; }
      &::-webkit-scrollbar-track { background: transparent; }
      &::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.3);
        border-radius: 3px;
        &:hover { background: rgba(255,255,255,0.5); }
      }
    }

    .team-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      cursor: pointer;
      transition: background 0.1s;

      &:hover { background: var(--bg-hover, rgba(255,255,255,0.05)); }

      &.active {
        background: var(--bg-active, rgba(26, 115, 232, 0.15));
        border-left: 3px solid var(--primary-color, #1a73e8);
        padding-left: 9px;
      }

      .team-name {
        flex: 1;
        min-width: 0;
        font-size: 12px;
        color: var(--text-primary, #e0e0e0);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: left;
      }

      .badge {
        flex-shrink: 0;
        font-size: 10px;
        padding: 2px 6px;
        background: var(--bg-input, rgba(255,255,255,0.1));
        border-radius: 8px;
        color: var(--text-muted, #888);
      }
    }

    /* チャンネルグリッド - カラム内スクロール */
    .channel-grid-area {
      flex: 1;
      min-height: 0; /* 重要: flexboxでスクロールを効かせる */
      overflow-y: auto;
      overflow-x: hidden;
      padding: 8px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.3) transparent;

      &::-webkit-scrollbar { width: 6px; }
      &::-webkit-scrollbar-track { background: transparent; }
      &::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.3);
        border-radius: 3px;
        &:hover { background: rgba(255,255,255,0.5); }
      }
    }

    .channel-group {
      margin-bottom: 12px;

      .group-header {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary, #888);
        margin-bottom: 6px;
        padding-left: 4px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
    }

    .channel-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .channel-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 10px;
      background: var(--bg-chip, rgba(255,255,255,0.05));
      border: 1px solid var(--border-color, rgba(255,255,255,0.1));
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.1s;
      font-size: 11px;

      input[type="checkbox"] { display: none; }

      .channel-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: var(--text-muted, #888);
      }

      .channel-name {
        max-width: 140px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--text-primary, #e0e0e0);
      }

      &:hover {
        background: var(--bg-hover, rgba(255,255,255,0.08));
        border-color: var(--border-hover, rgba(255,255,255,0.2));
      }

      &.selected {
        background: var(--bg-selected, rgba(26, 115, 232, 0.2));
        border-color: var(--primary-color, #1a73e8);

        .channel-icon { color: var(--primary-color, #1a73e8); }
      }
    }

    /* 選択済みカラム - カラム内スクロール */
    .selected-list {
      flex: 1;
      min-height: 0; /* 重要: flexboxでスクロールを効かせる */
      overflow-y: auto;
      overflow-x: hidden;
      padding: 8px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.3) transparent;

      &::-webkit-scrollbar { width: 6px; }
      &::-webkit-scrollbar-track { background: transparent; }
      &::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.3);
        border-radius: 3px;
        &:hover { background: rgba(255,255,255,0.5); }
      }
    }

    .selected-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: var(--bg-chip, rgba(255,255,255,0.05));
      border-radius: 4px;
      margin-bottom: 4px;

      .channel-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: var(--primary-color, #1a73e8);
        flex-shrink: 0;
      }

      .selected-item-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .channel-name {
        font-size: 12px;
        color: var(--text-primary, #e0e0e0);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .channel-team {
        font-size: 10px;
        color: var(--text-muted, #888);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .remove-btn {
        background: none;
        border: none;
        padding: 2px;
        cursor: pointer;
        color: var(--text-muted, #666);
        display: flex;
        align-items: center;
        border-radius: 4px;
        flex-shrink: 0;

        mat-icon { font-size: 14px; width: 14px; height: 14px; }

        &:hover { color: var(--error-color, #ea4335); background: rgba(234, 67, 53, 0.1); }
      }
    }

    .clear-all-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: calc(100% - 16px);
      margin: 8px;
      padding: 8px;
      border: 1px dashed var(--border-color, #3a3f4a);
      background: transparent;
      color: var(--text-secondary, #8b929a);
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;

      mat-icon { font-size: 14px; width: 14px; height: 14px; }

      &:hover { background: rgba(234, 67, 53, 0.1); color: var(--error-color, #ea4335); border-color: var(--error-color, #ea4335); }
    }

    /* AI選択アシスト */
    .ai-assist-section {
      padding: 8px;
      border-bottom: 1px solid var(--border-color, #3a3f4a);
    }

    .ai-input-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color, #3a3f4a);
      border-radius: 6px;
      transition: border-color 0.15s;

      &:focus-within {
        border-color: var(--primary-color, #1a73e8);
      }

      input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        font-size: 12px;
        color: var(--text-primary, #e0e0e0);
        min-width: 0;

        &::placeholder {
          color: var(--text-muted, #666);
        }

        &:disabled {
          opacity: 0.5;
        }
      }
    }

    .ai-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--primary-color, #1a73e8);
      flex-shrink: 0;
    }

    .ai-send-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: var(--primary-color, #1a73e8);
      color: white;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s;

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      &:hover {
        background: var(--primary-dark, #1557b0);
      }
    }

    .ai-error {
      margin-top: 6px;
      padding: 6px 8px;
      font-size: 11px;
      color: var(--error-color, #ea4335);
      background: rgba(234, 67, 53, 0.1);
      border-radius: 4px;
    }

    .empty-hint {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted, #666);
      text-align: center;

      mat-icon { font-size: 32px; width: 32px; height: 32px; margin-bottom: 8px; opacity: 0.5; }
      p { font-size: 12px; margin: 0; }
    }

    /* チーム区切り線 */
    .team-divider {
      height: 1px;
      background: var(--border-color, #3a3f4a);
      margin: 8px 12px;
    }

    .team-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 6px;
      color: var(--text-muted, #666);
    }

    .dm-icon { color: #4caf50; }
    .group-icon { color: #ff9800; }

    /* タイムラインレイアウト V2（展開式） */
    .timeline-layout-v2 {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .timeline-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .timeline-item {
      background: var(--bg-card, rgba(255,255,255,0.03));
      border: 1px solid var(--border-color, rgba(255,255,255,0.1));
      border-radius: 8px;
      overflow: hidden;
      transition: all 0.15s;

      &.selected {
        border-color: var(--primary-color, #1a73e8);
        background: rgba(26, 115, 232, 0.08);
      }
    }

    .timeline-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      cursor: pointer;
      transition: background 0.15s;

      &:hover {
        background: rgba(255, 255, 255, 0.03);
      }
    }

    .timeline-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .expand-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--text-muted, #888);
      transition: transform 0.2s;
    }

    .timeline-icon {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #1a73e8, #4285f4);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;

      mat-icon {
        color: white;
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }

    .timeline-info {
      .timeline-title {
        font-weight: 500;
        font-size: 14px;
        color: var(--text-primary, #e0e0e0);
      }
      .timeline-meta {
        font-size: 12px;
        color: var(--text-muted, #888);
        margin-top: 2px;
      }
    }

    .select-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border: 1px solid var(--border-color, #3a3f4a);
      background: transparent;
      color: var(--text-secondary, #8b929a);
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      &:hover {
        border-color: var(--primary-color, #1a73e8);
        color: var(--primary-color, #1a73e8);
      }

      &.selected {
        background: var(--primary-color, #1a73e8);
        border-color: var(--primary-color, #1a73e8);
        color: white;
      }
    }

    .timeline-channels {
      padding: 0 16px 12px 52px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .timeline-channel-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
      font-size: 12px;

      .ch-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: var(--text-muted, #888);
      }

      .ch-name {
        color: var(--text-primary, #e0e0e0);
      }

      .ch-team {
        color: var(--text-muted, #666);
        font-size: 10px;
        padding: 1px 4px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
        margin-left: 4px;
      }
    }

    .loading-channels {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      color: var(--text-muted, #888);
      font-size: 12px;
    }

    /* 共通ステート */
    .loading, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 32px;
      color: var(--text-muted, #666);

      mat-icon { font-size: 32px; width: 32px; height: 32px; opacity: 0.5; }
      p { margin: 0; font-size: 13px; }

      &.large {
        padding: 60px;
        mat-icon { font-size: 48px; width: 48px; height: 48px; }
        .hint { font-size: 12px; opacity: 0.7; }
      }
    }

    .loading-inline {
      display: flex;
      justify-content: center;
      padding: 16px;
    }
  `]
})
export class MattermostChannelSelectorComponent implements OnInit, OnChanges {
  @Input() providerName = '';
  @Input() initialSelection?: MattermostSelection;
  @Output() selectionChanged = new EventEmitter<MattermostSelection>();

  private readonly mmService = inject(ApiMattermostService);
  private readonly timelineService = inject(MattermostTimelineService);
  private readonly chatService = inject(ChatService);
  private readonly toolCallService = inject(ToolCallService);

  // AI選択アシスト
  aiQuery = '';
  isAiProcessing = false;
  aiError = '';

  teams: TeamWithCount[] = [];
  filteredTeams: TeamWithCount[] = [];
  channels: MattermostChannel[] = [];
  allChannelsMap = new Map<string, MattermostChannel[]>();
  timelines: MattermostTimeline[] = [];
  timelinesWithChannels: TimelineWithChannels[] = [];

  // DM・グループチャネル
  dmChannels: MattermostChannel[] = [];
  groupChannels: MattermostChannel[] = [];
  allUserChannels: MattermostChannel[] = [];

  // チーム並び順プリファレンス
  teamsOrder: string[] = [];

  selectedTeamId = 'all';
  selectedChannels: MattermostChannel[] = [];
  selectedTimelineIds: string[] = [];

  teamSearchQuery = '';
  channelSearchQuery = '';

  tabIndex = 0;
  isLoadingTeams = false;
  isLoadingChannels = false;
  isLoadingTimelines = false;

  displayChannelGroups: { teamId: string; teamName: string; channels: MattermostChannel[] }[] = [];

  get totalChannelCount(): number {
    let count = this.dmChannels.length + this.groupChannels.length;
    this.allChannelsMap.forEach(channels => count += channels.length);
    return count;
  }

  getDisplayedChannelCount(): number {
    return this.displayChannelGroups.reduce((sum, g) => sum + g.channels.length, 0);
  }

  ngOnInit(): void {
    if (this.providerName) {
      this.mmService.setProviderName(this.providerName);
      this.timelineService.setProviderName(this.providerName);
      this.loadTeams();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['providerName'] && !changes['providerName'].firstChange) {
      this.mmService.setProviderName(this.providerName);
      this.timelineService.setProviderName(this.providerName);
      this.loadTeams();
    }

    if (changes['initialSelection'] && this.initialSelection) {
      this.applyInitialSelection();
    }
  }

  private applyInitialSelection(): void {
    if (!this.initialSelection) return;
    this.selectedTeamId = this.initialSelection.teamId || 'all';
    this.tabIndex = this.initialSelection.sourceType === 'timeline' ? 1 : 0;
    if (this.initialSelection.timelineId) {
      this.selectedTimelineIds = [this.initialSelection.timelineId];
    }
  }

  private loadTeams(): void {
    this.isLoadingTeams = true;

    // チームとプリファレンスを並行して取得
    forkJoin({
      teams: this.mmService.mattermostTeams().pipe(
        catchError(err => { console.error('Failed to load teams:', err); return of([] as MattermostTeam[]); })
      ),
      preferences: this.mmService.preference().pipe(
        catchError(err => { console.error('Failed to load preferences:', err); return of([] as Preference[]); })
      ),
    }).subscribe(({ teams, preferences }) => {
      // teams_orderプリファレンスを取得（categoryをキーにしたマップに変換）
      const prefMap = preferences.reduce((acc, p) => {
        acc[p.category] = p;
        return acc;
      }, {} as { [key: string]: Preference });

      // teams_orderはカンマ区切り文字列
      if (prefMap['teams_order'] && prefMap['teams_order'].value) {
        this.teamsOrder = prefMap['teams_order'].value.split(',').filter(id => id.trim());
      } else {
        this.teamsOrder = [];
      }

      // チームをソート
      this.teams = this.sortTeams(teams.map(t => ({ ...t, channelCount: 0 })));
      this.filteredTeams = [...this.teams];
      this.isLoadingTeams = false;
      this.loadAllChannels();
      this.loadUserChannels();
      this.loadTimelines();
    });
  }

  /** チームをMattermost Light仕様に従ってソート */
  private sortTeams(teams: TeamWithCount[]): TeamWithCount[] {
    return teams.sort((a, b) => {
      const aIndex = this.teamsOrder.indexOf(a.id);
      const bIndex = this.teamsOrder.indexOf(b.id);

      // 両方がteams_orderにある場合はその順序
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // 片方だけteams_orderにある場合、ある方を優先
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      // どちらもない場合はアルファベット順
      return a.display_name.localeCompare(b.display_name, 'ja');
    });
  }

  /** DM・グループチャネルを含む全チャネルをロード */
  private loadUserChannels(): void {
    this.mmService.userChannels().pipe(
      catchError(err => { console.error('Failed to load user channels:', err); return of([]); })
    ).subscribe(channels => {
      this.allUserChannels = channels;
      this.dmChannels = channels.filter(c => c.type === 'D');
      this.groupChannels = channels.filter(c => c.type === 'G');
    });
  }

  private loadAllChannels(): void {
    if (this.teams.length === 0) return;
    this.isLoadingChannels = true;
    this.allChannelsMap.clear();

    let loadedCount = 0;
    this.teams.forEach(team => {
      this.mmService.mattermostUserTeamsChannels(team.id).pipe(
        catchError(err => { console.error(`Failed to load channels for team ${team.id}:`, err); return of([]); })
      ).subscribe(channels => {
        const publicChannels = channels.filter(c => c.type !== 'D' && c.type !== 'G');
        this.allChannelsMap.set(team.id, publicChannels);
        const teamIndex = this.teams.findIndex(t => t.id === team.id);
        if (teamIndex >= 0) this.teams[teamIndex].channelCount = publicChannels.length;

        loadedCount++;
        if (loadedCount === this.teams.length) {
          this.isLoadingChannels = false;
          this.updateDisplayChannels();
          if (this.initialSelection?.channelIds) {
            const allChannels: MattermostChannel[] = [];
            this.allChannelsMap.forEach(ch => allChannels.push(...ch));
            this.selectedChannels = allChannels.filter(c => this.initialSelection!.channelIds!.includes(c.id));
          }
        }
      });
    });
  }

  selectTeam(teamId: string): void {
    this.selectedTeamId = teamId;
    this.updateDisplayChannels();
  }

  private updateDisplayChannels(): void {
    this.displayChannelGroups = [];

    if (this.selectedTeamId === 'all') {
      // チームチャネル
      this.teams.forEach(team => {
        const channels = this.filterChannelsByQuery(this.allChannelsMap.get(team.id) || []);
        if (channels.length > 0) {
          this.displayChannelGroups.push({ teamId: team.id, teamName: team.display_name, channels });
        }
      });
      // DM・グループも含める
      const filteredDm = this.filterChannelsByQuery(this.dmChannels);
      if (filteredDm.length > 0) {
        this.displayChannelGroups.push({ teamId: '__dm__', teamName: 'ダイレクトメッセージ', channels: filteredDm });
      }
      const filteredGroup = this.filterChannelsByQuery(this.groupChannels);
      if (filteredGroup.length > 0) {
        this.displayChannelGroups.push({ teamId: '__group__', teamName: 'グループメッセージ', channels: filteredGroup });
      }
    } else if (this.selectedTeamId === '__dm__') {
      const filteredDm = this.filterChannelsByQuery(this.dmChannels);
      if (filteredDm.length > 0) {
        this.displayChannelGroups.push({ teamId: '__dm__', teamName: 'ダイレクトメッセージ', channels: filteredDm });
      }
    } else if (this.selectedTeamId === '__group__') {
      const filteredGroup = this.filterChannelsByQuery(this.groupChannels);
      if (filteredGroup.length > 0) {
        this.displayChannelGroups.push({ teamId: '__group__', teamName: 'グループメッセージ', channels: filteredGroup });
      }
    } else {
      const team = this.teams.find(t => t.id === this.selectedTeamId);
      const channels = this.filterChannelsByQuery(this.allChannelsMap.get(this.selectedTeamId) || []);
      if (team && channels.length > 0) {
        this.displayChannelGroups.push({ teamId: team.id, teamName: team.display_name, channels });
      }
    }
  }

  private filterChannelsByQuery(channels: MattermostChannel[]): MattermostChannel[] {
    let filtered = channels;
    if (this.channelSearchQuery.trim()) {
      const query = this.channelSearchQuery.toLowerCase();
      filtered = channels.filter(c => (c.display_name || c.name).toLowerCase().includes(query));
    }
    // チャネルをアルファベット順にソート
    return this.sortChannels(filtered);
  }

  /** チャネルをMattermost Light仕様に従ってソート */
  private sortChannels(channels: MattermostChannel[]): MattermostChannel[] {
    return [...channels].sort((a, b) => {
      const aName = a.display_name || a.name;
      const bName = b.display_name || b.name;
      return aName.localeCompare(bName, 'ja');
    });
  }

  filterTeams(): void {
    if (!this.teamSearchQuery.trim()) {
      this.filteredTeams = [...this.teams];
    } else {
      const query = this.teamSearchQuery.toLowerCase();
      this.filteredTeams = this.teams.filter(t => t.display_name.toLowerCase().includes(query));
    }
  }

  filterChannels(): void {
    this.updateDisplayChannels();
  }

  private loadTimelines(): void {
    this.isLoadingTimelines = true;
    this.timelineService.getTimelines().pipe(
      catchError(err => { console.error('Failed to load timelines:', err); return of([]); })
    ).subscribe(timelines => {
      this.timelines = timelines;
      this.timelinesWithChannels = timelines.map(t => ({
        ...t,
        isExpanded: false,
        channelDetails: undefined,
      }));
      this.isLoadingTimelines = false;
    });
  }

  /** タイムラインを展開/折りたたむ */
  toggleTimelineExpand(timeline: TimelineWithChannels): void {
    timeline.isExpanded = !timeline.isExpanded;

    // チャネル詳細がまだない場合はロード
    if (timeline.isExpanded && !timeline.channelDetails) {
      this.loadTimelineChannelDetails(timeline);
    }
  }

  /** タイムライン内のチャネル詳細を取得 */
  private loadTimelineChannelDetails(timeline: TimelineWithChannels): void {
    const channelIds = timeline.channels.map(c => c.channelId);
    if (channelIds.length === 0) {
      timeline.channelDetails = [];
      return;
    }

    // allUserChannelsから一括取得（既にロード済みのはず）
    const details: MattermostChannel[] = [];
    channelIds.forEach(id => {
      // まずallUserChannelsから探す
      let found = this.allUserChannels.find(c => c.id === id);
      if (!found) {
        // allChannelsMapからも探す
        this.allChannelsMap.forEach(channels => {
          const ch = channels.find(c => c.id === id);
          if (ch) found = ch;
        });
      }
      if (found) {
        details.push(found);
      }
    });

    timeline.channelDetails = details;
  }

  /** チャネルが属するチーム名を取得 */
  getChannelTeamName(channel: MattermostChannel): string {
    if (channel.type === 'D') return '';
    if (channel.type === 'G') return '';
    if (!channel.team_id) return '';
    const team = this.teams.find(t => t.id === channel.team_id);
    return team?.display_name || '';
  }

  /** 選択済みチャネルのチーム/カテゴリ名を取得 */
  getSelectedChannelTeamName(channel: MattermostChannel): string {
    if (channel.type === 'D') return 'ダイレクト';
    if (channel.type === 'G') return 'グループ';
    if (!channel.team_id) return '';
    const team = this.teams.find(t => t.id === channel.team_id);
    return team?.display_name || '';
  }

  onTabChange(): void {
    this.emitSelection();
  }

  getChannelIcon(channel: MattermostChannel): string {
    switch (channel.type) {
      case 'O': return 'tag';
      case 'P': return 'lock';
      case 'D': return 'person';
      case 'G': return 'group';
      default: return 'tag';
    }
  }

  isChannelSelected(channel: MattermostChannel): boolean {
    return this.selectedChannels.some(c => c.id === channel.id);
  }

  toggleChannel(channel: MattermostChannel, selected: boolean): void {
    if (selected) {
      if (!this.isChannelSelected(channel)) {
        this.selectedChannels = [...this.selectedChannels, channel];
      }
    } else {
      this.selectedChannels = this.selectedChannels.filter(c => c.id !== channel.id);
    }
    this.emitSelection();
  }

  removeChannel(channel: MattermostChannel): void {
    this.selectedChannels = this.selectedChannels.filter(c => c.id !== channel.id);
    this.emitSelection();
  }

  clearAllChannels(): void {
    this.selectedChannels = [];
    this.emitSelection();
  }

  selectTimeline(timeline: MattermostTimeline): void {
    if (this.selectedTimelineIds.includes(timeline.id)) {
      this.selectedTimelineIds = [];
    } else {
      this.selectedTimelineIds = [timeline.id];
    }
    this.emitSelection();
  }

  private emitSelection(): void {
    const sourceType = this.tabIndex === 1 ? 'timeline' : 'channel';

    if (sourceType === 'channel' && this.selectedChannels.length > 0) {
      const firstChannel = this.selectedChannels[0];
      let teamId = '';
      let teamName = '';
      this.allChannelsMap.forEach((channels, tId) => {
        if (channels.some(c => c.id === firstChannel.id)) {
          teamId = tId;
          teamName = this.teams.find(t => t.id === tId)?.display_name || '';
        }
      });

      this.selectionChanged.emit({
        sourceType: 'channel',
        teamId,
        teamName,
        channelIds: this.selectedChannels.map(c => c.id),
        channelNames: this.selectedChannels.map(c => c.display_name || c.name),
      });
    } else if (sourceType === 'timeline' && this.selectedTimelineIds.length > 0) {
      const timeline = this.timelines.find(t => t.id === this.selectedTimelineIds[0]);
      this.selectionChanged.emit({
        sourceType: 'timeline',
        teamId: '',
        teamName: '',
        timelineId: this.selectedTimelineIds[0],
        timelineName: timeline?.title || '',
      });
    }
  }

  /** AIに選択を依頼 */
  executeAiSelect(): void {
    if (!this.aiQuery.trim() || this.isAiProcessing) return;

    this.isAiProcessing = true;
    this.aiError = '';

    // 全チャンネルを収集
    const allChannels: MattermostChannel[] = [];
    this.allChannelsMap.forEach((channels, teamId) => {
      const team = this.teams.find(t => t.id === teamId);
      channels.forEach(ch => {
        allChannels.push({ ...ch, team_id: teamId });
      });
    });

    if (allChannels.length === 0) {
      this.aiError = 'チャンネルが読み込まれていません';
      this.isAiProcessing = false;
      return;
    }

    // AIに送るためにチャンネルリストを整形
    const channelListForAi = allChannels.map(ch => {
      const team = this.teams.find(t => t.id === ch.team_id);
      return {
        id: ch.id,
        name: ch.display_name || ch.name,
        team: team?.display_name || '',
        type: ch.type === 'P' ? 'private' : 'public',
      };
    });

    const prompt = `以下のMattermostチャンネル一覧から、ユーザーの要求に合うものを選んでください。
必要に応じてMattermostのツールを使って追加情報を取得しても構いません。
最終的に、選択すべきチャンネルのIDをJSON配列で返してください。該当するものがない場合は空配列を返してください。

ユーザーの要求: 「${this.aiQuery}」

チャンネル一覧:
${JSON.stringify(channelListForAi, null, 2)}

回答はJSON配列のみを返してください（説明不要）:`;

    let fullResponse = '';

    // Mattermostのツール定義を取得
    const mmTools = this.toolCallService.tools
      .filter(g => g.group === 'mattermost')
      .flatMap(g => g.tools.map(t => t.definition));

    this.chatService.chatCompletionObservableStreamNew({
      args: {
        max_tokens: 2000,
        model: 'gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        tools: mmTools.length > 0 ? mmTools : undefined,
        tool_choice: mmTools.length > 0 ? 'auto' : undefined,
      },
    }).subscribe({
      next: (result) => {
        result.observer.subscribe({
          next: (chunk) => {
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
            }
          },
          error: (err) => {
            console.error('AI stream error:', err);
            this.aiError = 'AIリクエストに失敗しました';
            this.isAiProcessing = false;
          },
          complete: () => {
            this.processAiResponse(fullResponse, allChannels);
            this.isAiProcessing = false;
          }
        });
      },
      error: (err) => {
        console.error('AI request error:', err);
        this.aiError = 'AIリクエストに失敗しました';
        this.isAiProcessing = false;
      }
    });
  }

  private processAiResponse(responseText: string, allChannels: MattermostChannel[]): void {
    try {
      // JSONを抽出（コードブロックで囲まれている場合も対応）
      let jsonStr = responseText.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // 配列を直接含む場合
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonStr = arrayMatch[0];
      }

      const selectedIds: string[] = JSON.parse(jsonStr);

      if (!Array.isArray(selectedIds)) {
        this.aiError = 'AIの応答を解析できませんでした';
        return;
      }

      if (selectedIds.length === 0) {
        this.aiError = '該当するチャンネルが見つかりませんでした';
        return;
      }

      // 選択を適用
      let addedCount = 0;
      for (const id of selectedIds) {
        const channel = allChannels.find(c => c.id === id);
        if (channel && !this.isChannelSelected(channel)) {
          this.selectedChannels = [...this.selectedChannels, channel];
          addedCount++;
        }
      }

      if (addedCount > 0) {
        this.emitSelection();
        this.aiQuery = '';
      } else {
        this.aiError = '選択済みか、対象が見つかりませんでした';
      }
    } catch (e) {
      console.error('AI response parse error:', e, responseText);
      this.aiError = 'AIの応答を解析できませんでした';
    }
  }
}
