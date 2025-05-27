import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MattermostChannelsCategoriesResponse, MattermostChannelsCategory, MattermostChannelsMembers, MattermostChannelsMembersResponse, MattermostEmoji, MattermostPost, MattermostReaction, MattermostTeamForView, MattermostTimeline, MattermostTimelineChannel, MattermostTimelineService, ToAiFilterType, ToAiIdType } from './../../services/api-mattermost.service';
import { ApiMattermostService, ChannelPosts, MattermostChannel, MattermostChannelForView, MattermostTeam, MattermostTeamUnread, MattermostThread, MattermostUser, Post, Preference } from '../../services/api-mattermost.service';
import { Component, ElementRef, inject, OnDestroy, OnInit, viewChild, viewChildren } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { CommonModule } from '@angular/common';
import { MarkdownModule } from 'ngx-markdown';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';

import { AuthService, OAuthAccount } from '../../services/auth.service';
import { GService } from '../../services/g.service';
import { safeForkJoin } from '../../utils/dom-utils';
import { catchError, finalize, from, map, mergeMap, Observable, Subscription, of, switchMap, tap, toArray } from 'rxjs';
import { DomUtils } from '../../utils/dom-utils';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { DialogComponent } from '../../parts/dialog/dialog.component';
import { MmTeamLogoComponent } from '../../parts/mm-team-logo/mm-team-logo.component';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { DragDeltaDirective } from '../../parts/drag-delta.directive';
import { ImageDialogComponent } from '../../parts/image-dialog/image-dialog.component';
import { MmCreateTimelineDialogComponent } from '../../parts/mm-create-timeline-dialog/mm-create-timeline-dialog.component';
import { UserMarkComponent } from "../../parts/user-mark/user-mark.component";
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Reaction } from '@mattermost/types/reactions';
import { MmMessageSelectorDialogComponent } from '../../parts/mm-message-selector-dialog/mm-message-selector-dialog.component';
import { FileDropDirective } from '../../parts/file-drop.directive';
import { CursorPositionDirective } from '../../parts/cursor-position.directive';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSelectModule } from '@angular/material/select';
import { FullPathFile } from './../../services/file-manager.service';
import { MmEmojiPickerComponent } from '../../parts/mm-emoji-picker/mm-emoji-picker.component';
import { AppMenuComponent } from "../../parts/app-menu/app-menu.component";
import { UserService } from '../../services/user.service';
import { ExtApiProviderService } from '../../services/ext-api-provider.service';
import { ExtApiProviderEntity } from '../../models/models';

type InType = 'main' | 'thread';
type InDtoSub = { message: string, fileList: FullPathFile[] };
type InDto = Record<InType, InDtoSub>;

@Component({
  selector: 'app-mattermost',
  imports: [
    CommonModule, FormsModule, RouterModule, MarkdownModule, MatAutocompleteModule, MatSelectModule,
    MatButtonModule, MatProgressSpinnerModule,
    MatExpansionModule, MatIconModule, MatCheckboxModule, MatBadgeModule, MatMenuModule, MatDividerModule, MatTooltipModule, MatRadioModule,
    MmTeamLogoComponent, DragDeltaDirective, UserMarkComponent, FileDropDirective, CursorPositionDirective,
    AppMenuComponent
  ],
  templateUrl: './mattermost.component.html',
  styleUrl: './mattermost.component.scss'
})
export class MattermostComponent implements OnInit, OnDestroy {
  readonly authService: AuthService = inject(AuthService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly router: Router = inject(Router);
  readonly activatedRoute: ActivatedRoute = inject(ActivatedRoute);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly g: GService = inject(GService);
  readonly apiMattermostService: ApiMattermostService = inject(ApiMattermostService);
  readonly mattermostTimelineService: MattermostTimelineService = inject(MattermostTimelineService);
  readonly userService: UserService = inject(UserService);

  emojiPicker(): void {
    this.dialog.open(MmEmojiPickerComponent, {});
  }

  copyToClipBoard = DomUtils.copyToClipboard;
  title: string = '';

  mattermostOriginUri: string = '';
  mmTeamList: MattermostTeamForView[] = [];
  mmTeamMas: { [key: string]: MattermostTeamForView } = {};
  mmChannelList: MattermostChannelForView[] = [];
  mmChannelMas: { [key: string]: MattermostChannelForView } = {};

  hoverRootId = '';

  isLoading = false;

  // ラジオボタンようにID混ざったmasを作る
  tlchMas: { [timelineId_channelId: string]: { type: 'channel', obj: MattermostTimelineChannel } | { type: 'timeline', obj: MattermostTimeline } } = {};

  selectedTeam?: MattermostTeamForView;
  selectedChannelIds: string[] = [];

  objectKeys = Object.keys;

  mmChannelPosts = {} as { [channel_id: string]: Post[] };
  mmUserMas: { [user_id: string]: MattermostUser } = {};
  mmTimelineList: MattermostTimeline[] = [];
  mmPosts: { [post_id: string]: Post } = {};

  mmThreadMas: { [root_id: string]: Post[][] } = {};
  mmGroupedSerializedPostList: Post[][] = [];
  mmGroupedFilteredPostList: Post[][] = [];
  mmGroupedFilteredLimitedPostList: Post[][] = [];
  mmThread: Post[][] = [];
  mmTimelineUnread: { [channel_id: string]: boolean } = {};
  selectedTimeline?: MattermostTimeline;
  radioSelectedId: string = '';

  messageCountMas: { [key: string]: { last_viewed_at: number, mention_count: number, unread_count: number } } = {};

  mmCategoriesList: MattermostChannelsCategory[] = [];
  mmMembers: MattermostChannelsMembers[] = [];
  initializedChannelList: string[] = [];

  newMessageDate: number = new Date().getTime();

  // 地獄のように汚くなってしまった。。無念。。。
  viewPostCountDelta = 5;
  viewPostCountInitial = 20;
  viewPostCount = this.viewPostCountInitial;

  isUnread = false;
  unreadChannelIds: string[] = [];

  directChannelViewCountDelta = 20;
  directChannelViewCount = this.directChannelViewCountDelta;

  providerName = 'sample';

  ngOnInit(): void {
    let { befProviderName, befTargetTeamId, befTargetChannelId } = {} as { befProviderName: string, befTargetTeamId: string, befTargetChannelId: string };

    const targetUpdate = (targetTeamId: string, targetChannelId: string) => {
      const selectedTeam = this.mmTeamList[Math.max(this.mmTeamList.findIndex(mmTeam => mmTeam.id === targetTeamId), 0)];
      this.isLoading = true;
      if (targetChannelId === 'default') {
        // default の場合はnextのIDを持ってきてルーティング
        this.selectTeam(selectedTeam).subscribe({
          next: next => {
            let nextId = '';
            if (targetTeamId === 'timeline') {
              if (next.length > 0 && next[0].channel_ids.length > 0) {
                nextId = next[0].channel_ids[0];
              } else {
                nextId = 'new-timeline';
              }
            } else {
              const category = next.find(o => o.channel_ids.length > 0);
              if (category) {
                nextId = category.channel_ids[0];
              } else {
                nextId = 'new-channel';
              }
            }
            this.router.navigate((['/', 'mattermost', this.providerName, targetTeamId, nextId]));
            this.isLoading = false;
          },
          error: error => {
            this.isLoading = false;
          }
        });
      } else {
        this.radioSelectedId = targetChannelId;
        //
        this.selectTeam(selectedTeam)
          .pipe(
            switchMap(
              next => (targetTeamId === 'timeline'
                ? this.selectTimeline(targetChannelId)
                : this.selectChannel(targetChannelId)
              )))
          .subscribe({
            next: next => {
              this.isLoading = false;
            },
            error: error => {
              this.isLoading = false;
            }
          });
      }
    };

    // パス変更検知
    this.activatedRoute.params.subscribe(params => {
      // 指定されたIDのチームを選択。（指定されたIDが無かったら先頭（0）を選ぶ）
      const { providerName, targetTeamId, targetChannelId } = params as { providerName: string, targetTeamId: string, targetChannelId: string };

      if (providerName === befProviderName) {
        // 同じプロバイダ名の場合は、チームとチャネルの変更があったかどうかを確認する。
        if (targetTeamId === befTargetTeamId && targetChannelId === befTargetChannelId) {
        } else {
          targetUpdate(targetTeamId, targetChannelId);
        }
      } else {
        // プロバイダ名が変更された場合は、初期化処理を行う。
        // providerNameを設定
        this.providerName = providerName;
        this.mattermostTimelineService.setProviderName(providerName);
        this.apiMattermostService.setProviderName(providerName);
        // WebSocket接続
        this.wsConnect();

        this.isLoading = true;
        // 主にチームとチャネルと設定の取得。この辺りは更新頻度低いので初回ロードのみにする。
        this.mattermostInitialize(providerName).subscribe({
          next: next => {
            targetUpdate(targetTeamId, targetChannelId);
          },
          error: error => {
            // alert(error);
            console.error(error);
            // location.href = `/api/oauth/mattermost/login/mattermost`;
          },
        })
        befProviderName = providerName;
      }

      befTargetTeamId = targetTeamId;
      befTargetChannelId = targetChannelId;
    });
  }

  ngOnDestroy(): void {
    // 気持ちの問題
    this.apiMattermostService.disconnect();
  }

  selectTimeline(mmTimelineId: string): Observable<any> {
    const mmTimeline = this.mmTimelineList.find(tl => tl.id == mmTimelineId);
    if (mmTimeline) {
      this.selectedTimeline = mmTimeline;
      this.selectedChannelIds = mmTimeline.channels.map(ch => ch.channelId);
      return this.mmLoadChannels(this.selectedChannelIds, 0, 10);
    } else {
      const mmTimeline = this.mmTimelineList.find(tl => {
        const obj = tl.channels.find(ch => ch.id === mmTimelineId);
        // console.log(obj, mmTimelineId);
        return obj;
      });
      if (mmTimeline) {
        this.selectedTimeline = mmTimeline;
        this.selectedChannelIds = mmTimeline.channels.filter(ch => ch.id === mmTimelineId).map(ch => ch.channelId);
        return this.mmLoadChannels(this.selectedChannelIds, 0, 10);
      } else if (this.mmChannelMas[mmTimelineId]) {
        // ダイレクトチャネルを選択した場合
        this.selectedTimeline = undefined;
        this.selectedChannelIds = [mmTimelineId];
        return this.mmLoadChannels(this.selectedChannelIds, 0, 10);
      } else {
        // TODO これはエラーにしてdefaultに飛ばすべき
        this.selectedTimeline = undefined;
        this.selectedChannelIds = [];
        return of({});
      }
    }
  }

  radioChange($event: MatRadioChange): void {
    this.setRadioSelectedId($event.value);
  }

  setRadioSelectedId(radioSelectedId: string): void {
    this.radioSelectedId = radioSelectedId;
    const tlch = this.tlchMas[radioSelectedId];
    switch (tlch.type) {
      case 'timeline':
        this.router.navigate(['/', 'mattermost', this.providerName, 'timeline', tlch.obj.id]);
        break;
      case 'channel':
        this.router.navigate(['/', 'mattermost', this.providerName, 'timeline', tlch.obj.id]);
        break;
    }
  }

  setMute(channel: MattermostTimelineChannel, isMute: boolean): void {
    channel.isMute = isMute;
    this.mattermostTimelineService.updateTimelineChannel(channel.timelineId, channel.id, channel).subscribe({
      next: next => {
        const chIds = this.selectedTimeline?.channels.filter(ch => !ch.isMute).map(ch => ch.channelId) || [];
        this.mmGroupedFilteredPostList = this.mmGroupedSerializedPostList.filter(g => chIds.includes(g[0].channel_id));
        this.setPostCountFiilter(this.mmGroupedFilteredPostList);
        this.scrollToBottom();
      },
      error: error => {
        this.snackBar.open(`更新に失敗しました。`, 'close', { duration: 3000 });
      },
    });
  }

  addToTimeline(mmTimeline: MattermostTimeline, mmChannel: MattermostChannelForView): void {
    mmChannel.isChecked = true;
    const channelIds = mmTimeline.channels.map(ch => ch.channelId);
    channelIds.push(mmChannel.id);
    this.mattermostTimelineService.updateTimeline(mmTimeline.id, { ...mmTimeline, channelIds: channelIds }).subscribe({
      next: next => {
        this.snackBar.open(`追加しました`, 'close', { duration: 3000 });
        this.reloadTimeline().subscribe(); // タイムラインのモデルを更新
      },
      error: error => {
        this.snackBar.open(`追加に失敗しました。`, 'close', { duration: 3000 });
      },
    });
  }

  createTimeline(mmChannel?: MattermostChannelForView): void {
    if (mmChannel) {
      mmChannel.isChecked = true;
    } else { }
    this.dialog.open(MmCreateTimelineDialogComponent, { data: { mmTeamList: this.mmTeamList } }).afterClosed().subscribe({
      next: next => {
        if (next) {
          this.reloadTimeline().subscribe({
            next: _ => {
              this.snackBar.open(`登録しました`, 'close', { duration: 3000 });
              this.router.navigate(['/', 'mattermost', this.providerName, 'timeline', next.id]);
            },
            error: error => {
              this.snackBar.open(`登録に失敗しました。`, 'close', { duration: 3000 });
            }
          }); // タイムラインのモデルを更新
        } else { }
      }
    });
  }

  editTimeline(mmTimeline: MattermostTimeline): void {
    this.dialog.open(MmCreateTimelineDialogComponent, { data: { mmTimeline, mmTeamList: this.mmTeamList } }).afterClosed().subscribe({
      next: next => {
        if (next) {
          this.snackBar.open(`更新しました`, 'close', { duration: 3000 });
          this.reloadTimeline().subscribe(); // タイムラインのモデルを更新
        } else { }
      },
      error: error => {
        this.snackBar.open(`更新に失敗しました。`, 'close', { duration: 3000 });
      }
    });
  }

  reloadTimeline(): Observable<MattermostTimeline[]> {
    return this.mattermostTimelineService.getTimelines().pipe(
      tap(next => {
        this.mmTimelineList = next;
        this.tlchMas = next.reduce((mas, curr) => {
          mas[curr.id] = { type: 'timeline', obj: curr };
          curr.channels.filter(ch => this.mmChannelMas[ch.channelId]).forEach(ch => {
            // 画面上でしか使わない未読フラグを更新する。
            this.mmTimelineUnread[ch.id] = !ch.lastViewedAt || ch.lastViewedAt.getTime() < this.mmChannelMas[ch.channelId].last_post_at;
            // console.log(ch.id, new Date(this.mmChannelMas[ch.channelId].last_post_at), ch.lastViewedAt, this.mmTimelineUnread[ch.id]);
            // IDでtimelineとtimelineChannelの両方引けるようにしておく。
            mas[ch.id] = { type: 'channel', obj: ch };
          });
          return mas;
        }, this.tlchMas);
      }));
  }

  selectTeam(mmTeam: MattermostTeamForView): Observable<MattermostChannelsCategory[]> {

    if (this.selectedTeam === mmTeam) {
      // 選択に変更無しの場合は何もしない。
      return of(this.mmCategoriesList);
    } else {
      this.selectedTeam = mmTeam;
    }
    this.mmCategoriesList = []; // カテゴリ分類用
    this.mmMembers = []; // 既読数カウント用

    // ダイレクトチャネルの時は仮置きで適当なチームIDでリクエストする。
    const team_id = ['direct', 'timeline'].includes(mmTeam.id) ? this.mmTeamList[2].id : mmTeam.id;

    // 未読件数を取るやつ
    return this.apiMattermostService.mattermostChannelsMembers(team_id).pipe(
      tap(members => {
        // // unreadのchannelIdだけ抽出（total_msg_countとmsg_countの比較）
        // const channel_ids = members
        //   .filter(member => this.mmChannelMas[member.channel_id].total_msg_count > member.msg_count)
        //   .map(member => member.channel_id)
        //   .filter(id => !this.mmChannelMas[id].delete_at)
        //   .sort((a, b) => this.mmChannelMas[b].last_post_at - this.mmChannelMas[a].last_post_at);
        // this.mmCategoriesList.push({ id: '', display_name: 'Unreads', team_id: '', collapsed: false, muted: false, sort_order: 0, sorting: '', type: 'unreads', user_id: '', channel_ids });

        this.messageCountMas = members.reduce((mas, curr) => {
          // カウントを纏める
          mas[curr.channel_id] = {
            last_viewed_at: curr.last_viewed_at,
            mention_count: curr.mention_count,
            unread_count: this.mmChannelMas[curr.channel_id].total_msg_count - curr.msg_count,
          };
          return mas;
        }, this.messageCountMas);
      }),
      catchError(e => {
        // TODO 握りつぶし。これが正しいかは未検証
        return e;
      }),
      switchMap(a => {
        if (mmTeam.id === 'timeline') {
          // 選択されたのがタイムラインなら別物だから別に飛ばす
          return this.reloadTimeline().pipe(
            map(next => {
              this.mmCategoriesList.push({
                id: '',
                user_id: '',
                team_id: 'timeline',
                sort_order: 0,
                sorting: '',
                type: 'timeline',
                display_name: `Mixed Timeline`,
                muted: false,
                collapsed: false,
                channel_ids: next.map(tl => tl.id),
              });
              return { categories: this.mmCategoriesList };
            }));
        } else {
          // 並び順を取るやつ
          return this.apiMattermostService.mattermostChannelsCategories(team_id);
        }
      }),
      map(next => {
        const categories = next as MattermostChannelsCategoriesResponse;
        // const unreadsCategory = this.mmCategoriesList[0];
        // console.log(categories);
        // console.log('allall', mmTeam.id, categories, categories.order.map(id => cateMas[id].display_name));
        const cateMas = categories.categories.reduce((mas, cate) => {
          mas[cate.id] = cate;
          return mas;
        }, {} as { [key: string]: MattermostChannelsCategory });

        if (mmTeam.id === 'timeline') {
          // ダイレクト系。 Direct Messages
          this.mmCategoriesList.push({
            id: '',
            user_id: '',
            team_id: 'timeline',
            sort_order: 0,
            sorting: '',
            type: 'D', // direct_messages
            display_name: `Direct Messages`,
            muted: false,
            collapsed: false,
            // channel_ids: this.mmChannelList.filter(mmChannel => !unreadsCategory.channel_ids.includes(mmChannel.id)).filter(mmChannel => ['D', 'G'].includes(mmChannel.type)).map(mmChannel => mmChannel.id).sort((a, b) => this.mmChannelMas[b].last_post_at - this.mmChannelMas[a].last_post_at),
            channel_ids: this.mmChannelList.filter(mmChannel => ['D', 'G'].includes(mmChannel.type)).map(mmChannel => mmChannel.id).sort((a, b) => this.mmChannelMas[b].last_post_at - this.mmChannelMas[a].last_post_at),
          });
          return this.mmCategoriesList;
        } else {
          // ダイレクトチャネル用とチャネル用でどちらも再構成する。
          this.mmCategoriesList = categories.order.map(id => {
            // console.log('allall', cateMas[id].channel_ids.length, cateMas[id].display_name);
            // if (mmTeam.id === 'direct') {
            //   // console.log('direct', cateMas[id].channel_ids.length, cateMas[id].display_name);
            //   // ダイレクト系。
            //   cateMas[id].channel_ids = this.mmChannelList.filter(mmChannel => !unreadsCategory.channel_ids.includes(mmChannel.id)).filter(mmChannel => ['D', 'G'].includes(mmChannel.type)).map(mmChannel => mmChannel.id).sort((a, b) => this.mmChannelMas[b].last_post_at - this.mmChannelMas[a].last_post_at);
            // } else {
            //   // チャネル系。archivedは外す。
            //   cateMas[id].channel_ids = cateMas[id].channel_ids.filter(channel_id => !unreadsCategory.channel_ids.includes(channel_id)).filter(id => ['O', 'P'].includes(this.mmChannelMas[id].type)).filter(id => !this.mmChannelMas[id].delete_at);
            // }
            // cateMas[id].channel_ids = cateMas[id].channel_ids.filter(channel_id => !unreadsCategory.channel_ids.includes(channel_id)).filter(id => !this.mmChannelMas[id].delete_at);
            cateMas[id].channel_ids = cateMas[id].channel_ids.filter(id => !this.mmChannelMas[id].delete_at && ['O', 'P'].includes(this.mmChannelMas[id].type));
            return cateMas[id];
            // cate.team_idは別物が入っていることが多いのでmmTeam.idを取る。
          });//.filter(cate => (mmTeam.id === 'direct') === (cate.type === 'direct_messages'));
          const directMessage = this.mmCategoriesList.find(cate => cate.type === 'direct_messages');
          if (directMessage) {
            directMessage.channel_ids = this.mmChannelList.filter(mmChannel => !mmChannel.delete_at && ['D', 'G'].includes(mmChannel.type)).sort((a, b) => b.last_post_at - a.last_post_at).map(mmChannel => mmChannel.id);
          } else { /** ここに来ることはあり得ない */ }

          // this.mmCategoriesList.unshift(unreadsCategory);

          return this.mmCategoriesList;
        }
      }),
    );
  }

  updateUnreadAndMentionCount(post: Post, delta: number = 1): void {
    // ダイレクトチャネルの並び替え
    if (this.mmTeamMas['direct']) {
      this.mmTeamMas['direct'].channelList.sort((a, b) => b.last_post_at - a.last_post_at);
    } else { }
    // 未読フラグ系の設定
    if (this.selectedChannelIds.includes(post.channel_id)) {
      // 現在開いているチャネルの場合は何もしない
    } else {
      // 開いてなければ未読フラグ更新
      if (this.messageCountMas[post.channel_id]) {
      } else {
        this.messageCountMas[post.channel_id] = {
          last_viewed_at: 0,
          mention_count: 0,
          unread_count: 0,
        };
      }
      // 古いの消した時にカウンターがマイナスになるからlast_viewed_atと比べて反映するかしないか判定するような考慮したつもりだけど間違ったかもしれない。
      // 強制的にマイナスにめり込まないようにmaxを入れておく。
      if (this.messageCountMas[post.channel_id].last_viewed_at < post.create_at) {
        // タイムラインのチャネルunread更新
        this.messageCountMas[post.channel_id].unread_count = Math.max(delta + this.messageCountMas[post.channel_id].unread_count, 0);
        // チームリストのunread更新
        this.mmTeamMas[this.mmChannelMas[post.channel_id].team_id].msg_count = Math.max(delta + this.mmTeamMas[this.mmChannelMas[post.channel_id].team_id].msg_count, 0);

        const mmUserInfo = JSON.parse(this.mmUser.userInfo);
        const mention_keys: string[] = mmUserInfo.notify_props.mention_keys.split(',');
        mention_keys.push(mmUserInfo.first_name);
        // TODO メンションカウントの方法は実際はもっと複雑なのが実装できてない。
        if (post.message.includes('@all') || post.message.includes('@here') || post.message.includes('@chnannel') || mention_keys.find(mention_key => post.message.includes(mention_key)) || (post.mentions || []).includes(this.mmUser.id)) {
          // タイムラインのメンションカウント更新
          this.messageCountMas[post.channel_id].mention_count = Math.max(delta + this.messageCountMas[post.channel_id].mention_count, 0);
          // チームリストのメンションカウント更新
          this.mmTeamMas[this.mmChannelMas[post.channel_id].team_id].mention_count = Math.max(delta + this.mmTeamMas[this.mmChannelMas[post.channel_id].team_id].mention_count, 0);
        }

        // タイムラインの未読フラグ更新
        this.mmTimelineList.forEach(tl => tl.channels.forEach(ch => {
          if (ch.channelId === post.channel_id) {
            this.mmTimelineUnread[ch.id] = !!this.messageCountMas[post.channel_id].unread_count;
            // ch.lastViewedAt = new Date(post.create_at);
          } else { }
        }));
      } else {
        // 古いのがどうにかなっただけだから無視
      }
    }

    this.isUnread = false;
    this.unreadChannelIds = [];
    this.mmCategoriesList.forEach(mmCate => {
      mmCate.channel_ids.forEach(channelId => {
        if (this.messageCountMas[channelId] && this.messageCountMas[channelId].unread_count) {
          if (this.selectedTeam?.id === 'timeline' && !['D', 'G'].includes(this.mmChannelMas[channelId].type)) {
            // タイムライン表示の時はダイレクトだけが対象
          } else {
            this.isUnread = true;
            this.unreadChannelIds.push(channelId);
          }
        } else { }
      });
    });
  }

  wsConnect(): void {
    // this.apiMattermostService.connect().pipe(switchMap(next => { }));
    this.apiMattermostService.connect().subscribe({
      next: next => {
        // observer.next();
        if (next.event === 'posted') {
          const post = JSON.parse(next.data.post) as Post;
          // if (this.mmTimelineList.find(tl => tl.channels.find(ch => ch.channelId === post.channel_id))) {
          //   // タイムラインに設定されているチャネル以外のものは弾く
          // } else {
          //   return;
          // }
          if (next.data.mentions) {
            // data部にmentionsが設定されていることもある。userIdが入っている。
            post.mentions = JSON.parse(next.data.mentions || '[]') as string[];
          } else { }

          (this.mmChannelMas[post.channel_id] ? of([]) : this.updateChannel()).subscribe({
            next: _ => {

              if (this.mmChannelMas[post.channel_id].team_id === 'direct') {
                // ダイレクトチャネルの場合は並び替えがある
                this.mmChannelMas[post.channel_id].last_post_at = post.create_at;
                this.mmTeamMas['direct'].channelList.sort((a, b) => b.last_post_at - a.last_post_at);
              } else {
                // TODO timeline表示じゃないとき用のunreadの並び替えは必要
              }

              // 未読フラグ系の設定
              this.updateUnreadAndMentionCount(post);

              // TODO ここはバグっている。別チャネルのスレッドを表示中にそのスレッドの更新があったら反映させるべきだがスレッドが無視されている。本来メイン系とスレッド系でフローを分けるべきだったかもしれない。
              if (this.initializedChannelList.includes(post.channel_id)) {
                // タイムラインに設定されているチャネル以外のものはメッセージ本体はいじらないのでここでおしまい
              } else {
                return;
              }

              if (this.mmPosts[post.id]) {
                // TODO 二重送信？？なので無視??editとして処理すべきか悩む。。
                return;
              } else {
              }
              this.mmChannelPosts[post.channel_id].push(post);
              this.mmPosts[post.id] = post;

              // 改行正規化
              post.messageForView = post.message;
              // post.messageForView = '\n' + Utils.splitCodeBlock(post.messageForView).map((block, index) => {
              //   if (index % 2 == 0) {
              //     return block.split('\n').map(line => {
              //       const trimed = line.trim();
              //       if (trimed[0] === '|' && trimed[trimed.length - 1] === '|') {
              //         return line;
              //       } else {
              //         return line + '\n';
              //       }
              //     }).join('\n');
              //   } else {
              //     return '```\n' + block.trim() + '\n```\n';
              //   }
              // }).join('') + '\n';

              // ---
              // 本来全部再作成はおかしいけどユーザー名置換がこの後にあるから仕方ない。
              const mmSerializedPostList: Post[] = [];
              this.mmGroupedSerializedPostList = [];
              this.mmGroupedFilteredPostList = [];
              this.mmGroupedFilteredLimitedPostList = [];
              if (this.selectedChannelIds.includes(post.channel_id)) {
              } else {
              }
              // Object.values(this.mmChannelPosts).forEach(posts => posts.forEach(post => mmSerializedPostList.push(post)));
              Object.values(this.mmChannelPosts).forEach(posts => posts.forEach(post => {
                if (this.selectedChannelIds.includes(post.channel_id)) {
                  // 見えてるやつだけ突っ込む
                  mmSerializedPostList.push(post);
                } else {
                }
              }));
              mmSerializedPostList.sort((a, b) => a.create_at - b.create_at);
              mmSerializedPostList.forEach((post, index) => {
                if (post.metadata && post.metadata.emojis) {
                  post.metadata.emojis.forEach(emoji => {
                    emoji.reactions_text = emoji.reactions?.map(reaction => this.mmUserMas[reaction.user_id]?.nickname).join(', ')
                  })
                } else { }
                const bef = mmSerializedPostList[index - 1];
                if (bef) {
                  if (post.channel_id === bef.channel_id && post.user_id == bef.user_id && post.root_id === bef.root_id && post.create_at - bef.create_at < 1000 * 60 * 5) {
                    // 1個前のやつにくっつける
                    this.mmGroupedSerializedPostList.at(-1)!.push(post);
                  } else {
                    this.mmGroupedSerializedPostList.push([post]);
                  }
                } else {
                  this.mmGroupedSerializedPostList.push([post]);
                }
              });

              this.mmThreadMas = {};
              this.mmGroupedSerializedPostList.forEach(g => {
                if (g[0].root_id) {
                  if (g[0].root_id in this.mmThreadMas) {
                  } else {
                    this.mmThreadMas[g[0].root_id] = [];
                  }
                  this.mmThreadMas[g[0].root_id].push(g);
                } else {
                  // root_idの指定なし＝threadじゃないので一個入れておしまい
                  this.mmThreadMas[g[0].id] = [g];
                  g[0].root_id = g[0].id; // root_idが空なので自分を入れておく
                }
              });

              // スレッド表示中の場合はスレッドを更新
              if (this.mmThread && this.mmThread.length > 0 && this.mmThreadMas[this.mmThread[0][0].id].length > 0) {
                this.mmThread = this.mmThreadMas[this.mmThread[0][0].id];
                // thread用のスクローラを最下端に持っていく
                setTimeout(() => this.rScroll().nativeElement.scrollTop = this.rScroll().nativeElement.scrollHeight, 500);
              } else { }

              this.mmGroupedFilteredPostList = this.mmGroupedSerializedPostList.filter(postGroup => this.selectedChannelIds.includes(postGroup[0].channel_id));
              this.setPostCountFiilter(this.mmGroupedFilteredPostList);

              if (this.selectedChannelIds.includes(post.channel_id)) {
                // 現在開いているチャネルの場合はスクローラを更新する
                this.scrollToBottom(true);
              } else {/** 開いてないチャネルの更新は無視 */ }

              // ユーザー処理
              const userIdSet = new Set<string>();
              const userNameSet = new Set<string>();

              // メンションのみを抽出する正規表現
              // const mentionRegex = /(?:^|\s)(@[a-zA-Z0-9_-]+)/g;
              const mentionRegex = /(?<![a-zA-Z0-9_-])@([a-zA-Z0-9_-]+)/g;
              if (post.user_id in this.mmUserMas) {
              } else {
                userIdSet.add(post.user_id);
              }

              // メンション部分を抽出
              const mentions = post.messageForView.match(mentionRegex)?.map((mention) => mention.trim());
              // console.log(mentions);
              mentions?.forEach(mention => {
                if (mention.slice(1) in this.mmUserMas) {
                } else {
                  userNameSet.add(mention.slice(1));
                }
              });

              if (post.metadata) {
                // 絵文字、リアクションのユーザー特定
                const preEmojiMas: { [key: string]: MattermostEmoji } = {};
                (post.metadata.emojis || []).forEach(emoji => {
                  preEmojiMas[emoji.name] = emoji;
                  userIdSet.add(emoji.creator_id);
                });

                const renewEmojis: MattermostEmoji[] = [];
                const emojiNameMas: { [key: string]: MattermostEmoji } = {};
                (post.metadata.reactions || []).forEach(reaction => {
                  if (reaction.emoji_name in emojiNameMas) {
                  } else {
                    // 扱いやすいようにemojisに注入しておく。
                    emojiNameMas[reaction.emoji_name] = {
                      id: preEmojiMas[reaction.emoji_name]?.id || '',
                      name: reaction.emoji_name,
                      reactions: [],
                      reactions_text: '', create_at: 0, update_at: 0, delete_at: 0, creator_id: '',
                    };
                    renewEmojis.push(emojiNameMas[reaction.emoji_name]);
                  }
                  emojiNameMas[reaction.emoji_name].reactions?.push({ user_id: reaction.user_id, nickname: '' });
                  userIdSet.add(reaction.user_id);
                });
                // 整形したemojiで上書き。
                post.metadata.emojis = renewEmojis;
              } else { }

              this.apiMattermostService.getUsersByIdsOrNamesSet(userIdSet, userNameSet).pipe(
                tap(next => {
                  // console.log(next);
                  const mmUserMas = next.reduce((bef, curr) => {
                    bef[curr.id] = curr;
                    bef[curr.username] = curr; // 使い分けが面倒なのでusernameもセットで入れてしまう。どうせ被ることはないから大丈夫。
                    return bef;
                  }, this.mmUserMas);

                  // メンション部分をマスタデータで置換する関数
                  function replaceMentionsWithMaster(text: string): string {
                    return text.replace(mentionRegex, (match) => {
                      const mention = match.trim().slice(1);
                      // マスタに存在すれば置換、なければそのまま
                      if (mmUserMas[mention]) {
                        return ` <a>@${mmUserMas[mention].nickname}</a> `;
                      } else if (['all', 'here', 'channel'].includes(mention)) {
                        return ` <a>@${mention}</a> `;
                      } else {
                        return `@${mention}`;
                      }
                    });
                  }
                  // markdown側で対応したからやらなくてOK
                  // post.messageForView = post.messageForView.replace('<a href="', '<a target="_blank" href="');
                  post.messageForView = replaceMentionsWithMaster(post.messageForView);
                  this.scrollToBottom();

                  this.mmGroupedFilteredPostList = this.mmGroupedSerializedPostList.filter(postGroup => this.selectedChannelIds.includes(postGroup[0].channel_id));
                  this.setPostCountFiilter(this.mmGroupedFilteredPostList);
                }),
              ).subscribe();
            },
            error: error => {
              console.error(error);
            },
          });
        } else if (next.event === 'post_edited') {
          const post = JSON.parse(next.data.post) as Post;

          if (this.initializedChannelList.includes(post.channel_id)) {
            // タイムラインに設定されているチャネル以外のものは弾く
          } else {
            return;
          }

          // 改行正規化
          post.messageForView = post.message;
          // post.messageForView = '\n' + Utils.splitCodeBlock(post.messageForView).map((block, index) => {
          //   if (index % 2 == 0) {
          //     return block.split('\n').map(line => {
          //       const trimed = line.trim();
          //       if (trimed[0] === '|' && trimed[trimed.length - 1] === '|') {
          //         return line;
          //       } else {
          //         return line + '\n';
          //       }
          //     }).join('\n');
          //   } else {
          //     return '```\n' + block.trim() + '\n```\n';
          //   }
          // }).join('') + '\n';

          // ユーザー処理
          const userIdSet = new Set<string>();
          const userNameSet = new Set<string>();

          // メンションのみを抽出する正規表現
          // const mentionRegex = /(?:^|\s)(@[a-zA-Z0-9_-]+)/g;
          const mentionRegex = /(?<![a-zA-Z0-9_-])@([a-zA-Z0-9_-]+)/g;
          if (post.user_id in this.mmUserMas) {
          } else {
            userIdSet.add(post.user_id);
          }

          // メンション部分を抽出
          const mentions = post.messageForView.match(mentionRegex)?.map((mention) => mention.trim());
          // console.log(mentions);
          mentions?.forEach(mention => {
            if (mention.slice(1) in this.mmUserMas) {
            } else {
              userNameSet.add(mention.slice(1));
            }
          });

          if (post.metadata) {
            // 絵文字、リアクションのユーザー特定
            const preEmojiMas: { [key: string]: MattermostEmoji } = {};
            (post.metadata.emojis || []).forEach(emoji => {
              preEmojiMas[emoji.name] = emoji;
              userIdSet.add(emoji.creator_id);
            });

            const renewEmojis: MattermostEmoji[] = [];
            const emojiNameMas: { [key: string]: MattermostEmoji } = {};
            (post.metadata.reactions || []).forEach(reaction => {
              if (reaction.emoji_name in emojiNameMas) {
              } else {
                // 扱いやすいようにemojisに注入しておく。
                emojiNameMas[reaction.emoji_name] = {
                  id: preEmojiMas[reaction.emoji_name]?.id || '',
                  name: reaction.emoji_name,
                  reactions: [],
                  reactions_text: '', create_at: 0, update_at: 0, delete_at: 0, creator_id: '',
                };
                renewEmojis.push(emojiNameMas[reaction.emoji_name]);
              }
              emojiNameMas[reaction.emoji_name].reactions?.push({ user_id: reaction.user_id, nickname: '' });
              userIdSet.add(reaction.user_id);
            });
            // 整形したemojiで上書き。
            post.metadata.emojis = renewEmojis;
          } else { }

          this.apiMattermostService.getUsersByIdsOrNamesSet(userIdSet, userNameSet).pipe(
            tap(next => {
              // console.log(next);
              const mmUserMas = next.reduce((bef, curr) => {
                bef[curr.id] = curr;
                bef[curr.username] = curr; // 使い分けが面倒なのでusernameもセットで入れてしまう。どうせ被ることはないから大丈夫。
                return bef;
              }, this.mmUserMas);

              // メンション部分をマスタデータで置換する関数
              function replaceMentionsWithMaster(text: string): string {
                // return text.replace(mentionRegex, (match) => {
                //   const mention = match.trim().slice(1);
                //   return ` <a>@${mmUserMas[mention] ? mmUserMas[mention].nickname : mention}</a> `; // マスタに存在すれば置換、なければそのまま
                // });
                return text.replace(mentionRegex, (match) => {
                  const mention = match.trim().slice(1);
                  // マスタに存在すれば置換、なければそのまま
                  if (mmUserMas[mention]) {
                    return ` <a>@${mmUserMas[mention].nickname}</a> `;
                  } else if (['all', 'here', 'channel'].includes(mention)) {
                    return ` <a>@${mention}</a> `;
                  } else {
                    return `@${mention}`;
                  }
                });
              }
              // post.messageForView = post.messageForView.replace('<a href="', '<a target="_blank" href="');
              post.messageForView = replaceMentionsWithMaster(post.messageForView);

              // messageとmetadataとedit_atだけ適用する
              if (this.mmPosts[post.id]) {
                this.mmPosts[post.id].message = post.messageForView;
                this.mmPosts[post.id].metadata = post.metadata;
                this.mmPosts[post.id].edit_at = post.edit_at;
              } else {
                // 存在しないpostなら追加する。
                this.mmPosts[post.id] = post;
                const bef = this.mmGroupedSerializedPostList.at(-1)!.at(-1);
                if (bef) {
                  if (post.channel_id === bef.channel_id && post.user_id == bef.user_id && post.root_id === bef.root_id && post.create_at - bef.create_at < 1000 * 60 * 2) {
                    // 1個前のやつにくっつける
                    this.mmGroupedSerializedPostList.at(-1)!.push(post);
                  } else {
                    this.mmGroupedSerializedPostList.push([post]);
                  }
                } else {
                  this.mmGroupedSerializedPostList.push([post]);
                }
              }

              this.scrollToBottom();

              this.mmGroupedFilteredPostList = this.mmGroupedSerializedPostList.filter(postGroup => this.selectedChannelIds.includes(postGroup[0].channel_id));
              this.setPostCountFiilter(this.mmGroupedFilteredPostList);
            }),
          ).subscribe();
        } else if (next.event === 'post_deleted') {
          const post = JSON.parse(next.data.post) as Post;

          this.updateUnreadAndMentionCount(post, -1);

          // 削る
          if (Object.keys(this.mmChannelPosts).includes(post.channel_id)) {
            // タイムラインに設定されているチャネル以外のものはメッセージ本体はいじらないのでここでおしまい
          } else {
            return;
          }
          this.mmChannelPosts[post.channel_id] = this.mmChannelPosts[post.channel_id].filter(_post => post.id !== _post.id);
          delete this.mmPosts[post.id];

          // --
          // 本来全部再作成はおかしいけどユーザー名置換がこの後にあるから仕方ない。
          const mmSerializedPostList: Post[] = [];
          this.mmGroupedSerializedPostList = [];
          this.mmGroupedFilteredPostList = [];
          this.mmGroupedFilteredLimitedPostList = [];
          if (this.selectedChannelIds.includes(post.channel_id)) {
          } else {
          }
          // Object.values(this.mmChannelPosts).forEach(posts => posts.forEach(post => mmSerializedPostList.push(post)));
          Object.values(this.mmChannelPosts).forEach(posts => posts.forEach(post => {
            if (this.selectedChannelIds.includes(post.channel_id)) {
              // 見えてるやつだけ突っ込む
              mmSerializedPostList.push(post);
            } else {
            }
          }));
          mmSerializedPostList.sort((a, b) => a.create_at - b.create_at);
          mmSerializedPostList.forEach((post, index) => {
            if (post.metadata && post.metadata.emojis) {
              post.metadata.emojis.forEach(emoji => {
                emoji.reactions_text = emoji.reactions?.map(reaction => this.mmUserMas[reaction.user_id]?.nickname).join(', ')
              })
            } else { }
            const bef = mmSerializedPostList[index - 1];
            if (bef) {
              if (post.channel_id === bef.channel_id && post.user_id == bef.user_id && post.root_id === bef.root_id && post.create_at - bef.create_at < 1000 * 60 * 2) {
                // 1個前のやつにくっつける
                this.mmGroupedSerializedPostList.at(-1)!.push(post);
              } else {
                this.mmGroupedSerializedPostList.push([post]);
              }
            } else {
              this.mmGroupedSerializedPostList.push([post]);
            }
          });

          this.mmThreadMas = {};
          this.mmGroupedSerializedPostList.forEach(g => {
            if (g[0].root_id) {
              if (g[0].root_id in this.mmThreadMas) {
              } else {
                this.mmThreadMas[g[0].root_id] = [];
              }
              this.mmThreadMas[g[0].root_id].push(g);
            } else {
              // root_idの指定なし＝threadじゃないので一個入れておしまい
              this.mmThreadMas[g[0].id] = [g];
              g[0].root_id = g[0].id; // root_idが空なので自分を入れておく
            }
          });

          // スレッド表示中の場合はスレッドを更新
          if (this.mmThread && this.mmThread.length > 0 && this.mmThreadMas[this.mmThread[0][0].id].length > 0) {
            this.mmThread = this.mmThreadMas[this.mmThread[0][0].id];
            // thread用のスクローラを最下端に持っていく
            setTimeout(() => this.rScroll().nativeElement.scrollTop = this.rScroll().nativeElement.scrollHeight, 500);
          } else { }

          this.mmGroupedFilteredPostList = this.mmGroupedSerializedPostList.filter(postGroup => this.selectedChannelIds.includes(postGroup[0].channel_id));
          this.setPostCountFiilter(this.mmGroupedFilteredPostList);
          this.scrollToBottom(true);
          // --
        } else if (next.event === 'reaction_added') {
          // リアクションを追加
          const reaction = JSON.parse(next.data.reaction) as MattermostReaction;
          const post = this.mmPosts[reaction.post_id];
          if (post && post.metadata) {
            // リアクション項目自体が無ければ追加
            post.metadata.reactions = post.metadata.reactions || [];
            // リアクション追加
            post.metadata.reactions.push(reaction);
            // emojiが未登録だったら追加
            const emojis = post.metadata?.emojis?.find(emoji => emoji.name === reaction.emoji_name);
            if (emojis) {
              emojis.reactions?.push({ user_id: reaction.user_id, nickname: this.mmUserMas[reaction.user_id].nickname });
              emojis.reactions_text = emojis.reactions?.map(reaction => this.mmUserMas[reaction.user_id]?.nickname).join(', ');
            } else {
              post.metadata.emojis = post.metadata.emojis || [];
              (this.apiMattermostService.emojiMap[reaction.emoji_name] ? of({ id: '' }) : this.apiMattermostService.mattermostGetEmojiByName(reaction.emoji_name)).subscribe({
                next: next => {
                  post.metadata?.emojis?.push({
                    id: next.id,
                    name: reaction.emoji_name,
                    reactions: [{ user_id: reaction.user_id, nickname: this.mmUserMas[reaction.user_id].nickname }],
                    reactions_text: this.mmUserMas[reaction.user_id]?.nickname, create_at: 0, update_at: 0, delete_at: 0, creator_id: '',
                  });
                }
              });
            }
          } else {/** 取得していないpostは無視する */ }
        } else if (next.event === 'reaction_removed') {
          // リアクションを削除
          const reaction = JSON.parse(next.data.reaction) as Reaction;
          const post = this.mmPosts[reaction.post_id];
          if (this.mmPosts[reaction.post_id] && this.mmPosts[reaction.post_id].metadata.reactions) {
            this.mmPosts[reaction.post_id].metadata.reactions = this.mmPosts[reaction.post_id].metadata.reactions?.filter(r => !(r.user_id === reaction.user_id && r.emoji_name === reaction.emoji_name));
            const emojis = post.metadata?.emojis?.find(emoji => emoji.name === reaction.emoji_name);
            if (emojis) {
              emojis.reactions = emojis.reactions?.filter(r0 => r0.user_id !== reaction.user_id);
            }
            // console.log(this.mmPosts[reaction.post_id].metadata.reactions);
          } else {/** 取得していないpostは無視する */ }
        } else if (next.event === 'close' || next.event === 'error') {
          this.snackBar.open(`切断されました。リロードしてください。`, 'close', { duration: 10000 });
        } else {
          // console.log(next);
        }
      }
    });
  }

  readonly extApiProviderService: ExtApiProviderService = inject(ExtApiProviderService);
  mmUser!: { id: string, providerUserId: string, userInfo: string };
  //
  mattermostInitialize(providerName: string): Observable<boolean> {
    // TODO 本来は pipe->switchMap だけでやらないとダメな気はしている。
    ;
    return safeForkJoin<ExtApiProviderEntity | { oauthAccounts: OAuthAccount[] }>([
      this.extApiProviderService.getApiProvider(`mattermost-${providerName}`).pipe(tap(next => { this.mattermostOriginUri = next.uriBase; })),
      this.authService.getOAuthAccountList()
    ]).pipe(switchMap(next => {
      const oAuthAccountList = (next[1] as { oauthAccounts: OAuthAccount[] }).oauthAccounts;
      const mmUser = oAuthAccountList.find(oAuthAccount => oAuthAccount.provider === `mattermost-${providerName}`);
      if (mmUser) {
        this.mmUser = mmUser;
        // mattermost認証済みだったら初回ロード時用のものを全部持ってくる。
        return this.apiMattermostService.mattermostMe().pipe(switchMap(me => safeForkJoin<Preference[] | MattermostTeam[] | MattermostTeamUnread[] | MattermostChannel[] | MattermostTimeline[] | MattermostUser[]>([
          this.apiMattermostService.preference(),
          this.apiMattermostService.mattermostTeams(),
          this.apiMattermostService.mattermostTeamsUnread(),
          // this.apiMattermostService.userChannels(0, true),
          // this.wsConnect(),
        ]).pipe(
          tap(next => {
            const mmPreference = next[0] as Preference[];
            const mmTeams = next[1] as MattermostTeam[];
            const mmTeamUnread = next[2] as MattermostTeamUnread[];
            // const mmUserChannels = next[3] as MattermostChannel[];

            const preference = mmPreference.reduce((mas, curr) => {
              mas[curr.category] = curr;
              return mas;
            }, {} as { [keyt: string]: Preference });

            let teamsOrder: string[] = [];
            // チームの並び順
            if (preference['teams_order']) {
              teamsOrder = preference['teams_order'].value.split(',') as string[];
              // teams_orderに載っていないIDもあるので、teamsAPIで取れたもののIDを追加する
              const teamIdSet = new Set<string>();
              [...mmTeams.map(mmTeam => mmTeam.id), ...mmTeamUnread.map(mmTeam => mmTeam.team_id)].forEach(id => teamIdSet.add(id));
              teamsOrder.forEach(id => teamIdSet.delete(id));
              Array.from(teamIdSet).forEach(id => teamsOrder.push(id));
            } else {
              teamsOrder = mmTeams.map(mmTeam => mmTeam.id);
            }

            // console.log(teamsOrder);

            const mmTeamMas = mmTeams.reduce((res, curr) => {
              res[curr.id] = curr;
              return res;
            }, {} as { [key: string]: MattermostTeam });
            const mmTeamUnreadMap = mmTeamUnread.reduce((res, curr) => {
              res[curr.team_id] = curr;
              return res;
            }, {} as { [key: string]: MattermostTeamUnread });
            // 並び順を設定通りにしたチームリスト
            this.mmTeamList = teamsOrder.map(id => ({ ...mmTeamMas[id], ...mmTeamUnreadMap[id], channelList: [], caegoryChannelList: [], isChecked: 0 }));
            // ダイレクトメッセージ振分用のチーム
            this.mmTeamList.unshift({
              id: 'direct',
              team_id: 'direct',
              channelList: [],
              caegoryChannelList: [],
              isChecked: 0,
              create_at: 0,
              update_at: 0,
              delete_at: 0,
              display_name: 'Direct Message',
              name: this.mmTeamList[0].name, // nameはリンクのために使うので、適当に存在するチームの先頭のものを設定しておく。
              description: 'Direct Message Team',
              email: 'example@example.com',
              type: 'I',
              company_name: '',
              allowed_domains: 'example.com',
              invite_id: '',
              allow_open_invite: false,
              last_team_icon_update: 0,
              scheme_id: '',
              group_constrained: false,
              policy_id: null,
              msg_count: 0,
              mention_count: 0,
            });
            // タイムライン
            this.mmTeamList.unshift({
              id: 'timeline',
              team_id: 'timeline',
              channelList: [],
              caegoryChannelList: [],
              isChecked: 0,
              create_at: 0,
              update_at: 0,
              delete_at: 0,
              display_name: 'Timeline',
              name: 'timeline',
              description: 'Timeline Team',
              email: 'example@example.com',
              type: 'I',
              company_name: '',
              allowed_domains: 'example.com',
              invite_id: '',
              allow_open_invite: false,
              last_team_icon_update: 0,
              scheme_id: '',
              group_constrained: false,
              policy_id: null,
              msg_count: 0,
              mention_count: 0,
            });
            this.mmTeamMas = this.mmTeamList.reduce((res, curr) => {
              res[curr.id] = curr;
              return res;
            }, {} as { [key: string]: MattermostTeamForView });
          }))),
          switchMap(_ => {
            return this.updateChannel();
          }),
          map(_ => true)
        );
      } else {
        return of(false);
      }
    }));
  }

  updateChannel(): Observable<MattermostChannel[]> {
    return this.apiMattermostService.userChannels(0, true).pipe(tap(mmUserChannels => {
      this.mmChannelList = mmUserChannels.map(channel => ({ ...channel, isChecked: false })).sort((a, b) => b.last_post_at - a.last_post_at);
      this.mmChannelMas = this.mmChannelList.reduce((res, curr) => {
        res[curr.id] = curr;
        // direct messageはteam_idが入っていない。
        curr.team_id = curr.team_id || 'direct';
        if (this.mmTeamMas[curr.team_id] && ['O', 'P'].includes(curr.type)) {
          this.mmTeamMas[curr.team_id].channelList.push(curr);
        } else if (['D', 'G'].includes(curr.type)) {
          this.mmTeamMas['direct'].channelList.push(curr);
        } else {
          // teamIdが存在していない場合（多分新規作成されたものが間に合ってないだけ。）
          // console.log(`team_id = curr.team_id=${curr.team_id}`);
          // console.log(curr);
        }
        return res;
      }, {} as { [key: string]: MattermostChannelForView });
      // 並べ替え
      this.mmTeamMas['direct'].channelList.sort((a, b) => b.last_post_at - a.last_post_at);
    }));
  }

  updateTeamCheckFlagAll(): void {
    Object.entries(this.mmTeamMas).forEach(([key, mmTeam]) => this.updateTeamCheckFlag(mmTeam));
  }
  updateTeamCheckFlag(mmTeam: MattermostTeamForView): void {
    const flagSet = new Set<boolean>();
    mmTeam.channelList.forEach(channel => flagSet.add(channel.isChecked));
    mmTeam.isChecked = flagSet.size === 2 ? 1 : ([...flagSet][0] ? 2 : 0);
  }

  imageDialog(file: { id: string, name: string, mime_type: string, dataUrl?: string }): void {
    this.dialog.open(ImageDialogComponent, { data: { fileName: file.name, imageBase64String: file.dataUrl } });
  }
  onImageLoad($event: Event, file: { id: string, name: string, mime_type: string, dataUrl?: string }): void {
    function getDataURL(img: HTMLImageElement) {
      // Create canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      // Set width and height to the natural size of the image
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // Draw the image at its natural size
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

      // Get the data URL
      return canvas.toDataURL(file.mime_type);
    }
    file.dataUrl = getDataURL($event.target as HTMLImageElement);
    this.scrollToBottom();
  }

  scrollToBottom(force: boolean = false): void {
    if (force || this.scroll().nativeElement.scrollHeight - this.scroll().nativeElement.scrollTop < 600) {
      setTimeout(() => this.scroll().nativeElement.scrollTop = this.scroll().nativeElement.scrollHeight, 300);
    } else {
      // TODO 最下端に行くボタンを出す
    }
  }

  setPostCountFiilter(mmGroupedFilteredPostList: Post[][]): void {
    if (this.selectedTeam && this.selectedTeam.id === 'timeline' && this.selectedTimeline) {
      // timelineの場合はmuteフラグでのチャネル絞り込みを行う。(mute時でもシングル選択されてたら表示する)
      const chIds = this.selectedTimeline.channels.filter(ch => !ch.isMute || this.radioSelectedId === ch.id).map(ch => ch.channelId);
      mmGroupedFilteredPostList = mmGroupedFilteredPostList.filter(postGroup => chIds.includes(postGroup[0].channel_id));
    } else { }

    // 表示用リスト作成
    this.mmGroupedFilteredLimitedPostList = mmGroupedFilteredPostList.filter((postGroup, index) => index >= mmGroupedFilteredPostList.length - this.viewPostCount);

    if (this.selectedTeam && this.selectedTeam.id === 'timeline' && this.selectedTimeline) {
      // 既読タイムスタンプを更新する(表示行に含まれなかったやつは更新されない)
      const timeline = this.selectedTimeline;
      const maxDateMas = this.mmGroupedFilteredLimitedPostList.flatMap(ary => ary.map(v => v)).reduce((mas, curr) => {
        // // TODO 本来はcreated_atじゃなくてedite_atかupdate_atで比較すべきだと思うけど、それだとchannelの方のlast_updateとズレるので仕方なくcreate_atで比較する
        // mas[curr.channel_id] = Math.max(mas[curr.channel_id] || 0, curr.create_at || 0, curr.edit_at || 0, curr.update_at || 0);
        // mas[curr.channel_id] = Math.max(mas[curr.channel_id] || 0, curr.create_at);
        mas[curr.channel_id] = Math.max(mas[curr.channel_id] || 0, this.mmChannelMas[curr.channel_id].last_post_at, curr.create_at || 0, curr.edit_at || 0, curr.update_at || 0);
        return mas;
      }, {} as { [key: string]: number });
      // ずらしたらバグったのでやめる
      // Object.keys(maxDateMas).forEach(chId => {
      //   maxDateMas[chId] = maxDateMas[chId] + 60 * 9 * 60 * 1000; // 9時間ずらす
      // });

      const chIdSet = this.mmGroupedFilteredLimitedPostList.reduce((set, curr) => {
        set.add(curr[0].channel_id);
        return set;
      }, new Set<string>());

      // 新しいメッセージが来てたら既読タイムスタンプを更新する
      const chList = Array.from(chIdSet).map(chId => timeline.channels.find(ch => ch.channelId === chId))
        .filter(v => !!v)
        .filter(ch => new Date(ch.lastViewedAt || 0).getTime() < maxDateMas[ch.channelId]);

      // mattermost向けは逐次で投げる
      this.clearUnreadAndMentionCount(chIdSet).subscribe();
      // ribbon向けは並列で投げる
      safeForkJoin(
        chList.map(ch => this.mattermostTimelineService.updateTimelineChannel(timeline.id, ch.id, { isMute: ch.isMute, lastViewedAt: new Date(maxDateMas[ch.channelId]) }).pipe(
          tap(next => {
            // タイムスタンプ埋める
            ch.lastViewedAt = new Date(maxDateMas[ch.channelId]);
            // 未読フラグ更新
            this.mmTimelineUnread[ch.id] = false;
          }),
        ))
      ).subscribe({ next: next => { /** 何もしない */ } });
    } else {
      const chIdSet = this.mmGroupedFilteredLimitedPostList.reduce((set, curr) => {
        set.add(curr[0].channel_id);
        return set;
      }, new Set<string>());
      this.clearUnreadAndMentionCount(chIdSet).subscribe();
    }
  }

  clearUnreadAndMentionCount(channelIdSet: Set<string>) {
    const channelIdList = Array.from(channelIdSet);
    // mattermost向けは逐次で投げる
    return from(channelIdList.map(channelId => this.apiMattermostService.mattermostView(channelId))).pipe(
      mergeMap(obs => obs, 1),
      // switchMap(next => this.updateTeamUnread()),
      map(next => {
        channelIdList.forEach(chId => {
          if (this.messageCountMas[chId]) {
            this.messageCountMas[chId].unread_count = 0;
            this.messageCountMas[chId].mention_count = 0;
          } else { }
          // タイムラインの未読フラグ更新
          this.mmTimelineList.forEach(tl => tl.channels.forEach(ch => {
            if (ch.channelId === chId) {
              this.mmTimelineUnread[ch.id] = false;
            } else { }
          }));
        });

        this.isUnread = false;
        this.unreadChannelIds = [];
        this.mmCategoriesList.forEach(mmCate => {
          mmCate.channel_ids.forEach(channelId => {
            if (this.messageCountMas[channelId] && this.messageCountMas[channelId].unread_count) {
              this.isUnread = true;
              this.unreadChannelIds.push(channelId);
            } else { }
          });
        });
      }),
    );
  }

  // /** チームリストのunreadを更新する。 */
  // updateTeamUnread(): Observable<void> {
  //   return this.apiMattermostService.mattermostTeamsUnread().pipe(map(mmTeamUnreadList => {
  //     mmTeamUnreadList.forEach(mmTeamUnread => {
  //       this.mmTeamMas[mmTeamUnread.team_id] = { ...this.mmTeamMas[mmTeamUnread.team_id], ...mmTeamUnread };
  //     });
  //   }));
  // }

  onScroll(event: any) {
    const scrollTop = event.target.scrollTop;
    if (this.mmGroupedFilteredPostList.length > this.viewPostCount) {
      if (scrollTop === 0) {
        setTimeout(() => {
          // 上端まで行ったらほんのり止めてから次を読込
          this.viewPostCount += this.viewPostCountDelta;
          this.setPostCountFiilter(this.mmGroupedFilteredPostList);
          // 余白を設けないと0に貼りついてしまう。
          event.target.scrollTop = 10;
          setTimeout(() => this.onScroll(event), 1000);
        }, 500);
      } else {
        const scroller = this.scroll().nativeElement;
        if (scroller) {
          if (Math.ceil(scrollTop + scroller.clientHeight + 10) >= scroller.scrollHeight) {
            // 下端についたら表示量を絞る。
            this.viewPostCount = this.viewPostCountInitial;
            this.setPostCountFiilter(this.mmGroupedFilteredPostList);
          } else {/** 中間状態 */ }
        } else { /** スクローラーが無い */ }
      }
    } else { }
  }

  sendToAI(mmThread: Post[][] | undefined): void {
    const idParam: { idType: ToAiIdType, id: string } = { idType: 'timeline', id: '' };
    if (mmThread && mmThread.length && mmThread[0].length) {
      idParam.idType = 'thread';
      idParam.id = mmThread[0][0].root_id;
    } else {
      if (this.selectedTeam?.id === 'timeline') {
        if (this.mmTimelineList.find(tl => tl.id === this.radioSelectedId)) {
          idParam.idType = 'timeline';
        } else if (this.mmChannelList.find(ch => ch.id === this.radioSelectedId)) {
          idParam.idType = 'channel';
        } else {
          idParam.idType = 'timelineChannel';
        }
        idParam.id = this.radioSelectedId;
      } else {
        idParam.idType = 'channel';
        idParam.id = this.selectedChannelIds[0];
      }
    }

    this.dialog.open(MmMessageSelectorDialogComponent, {
      data: {
        // タイトル
        title: this.title,
        // タイムラインの場合のチャネル数
        channelCount: this.selectedChannelIds.length,
        id: idParam.id,
        idType: idParam.idType,
      }
    }).beforeClosed().subscribe({
      next: next => {
        if (next) {
          switch (next.filterType) {
            case 'timespan':
            case 'count':
              // this.router.navigate(['/chat', next.thread.projectId, next.thread.id]);
              window.open(`./#/chat/${next.threadGroup.projectId}/${next.threadGroup.id}`, '_blank');
              break;
            case 'batch':
              break;
          }
        } else {
          // キャンセル
          return;
        }
      }
    });
  }

  setTitle(): void {
    this.title = (this.selectedTeam?.id === 'timeline' && this.selectedTimeline) ? this.selectedTimeline.title : this.mmChannelMas[this.selectedChannelIds[0]].display_name;
    document.title = `Mattermost : ${this.title}`;
  }

  mmLoadChannels(mmChannelIdList: string[], page: number = 0, perPage: number = 60, span: number = 0): Observable<any> {
    const mmChannelPostList = [] as { channelId: string, channelPosts: ChannelPosts }[];

    // New Messageの線を引くためのもの
    if (this.selectedTeam?.id === 'timeline' && this.selectedTimeline) {
      // this.newMessageDate = this.selectedTimeline.channels[0].lastViewedAt?.getTime() - 9 * 60 * 60 * 1000;
      // channelsのlastViewedAtの再過去を取得する
      this.newMessageDate = this.selectedTimeline.channels
        .map(ch => ch.lastViewedAt?.getTime() || 0) // `undefined`をエポック（0）に変換
        .reduce((min, time) => Math.min(min, time), Infinity); // 最小値を取得
    } else {
      this.newMessageDate = this.messageCountMas[mmChannelIdList[0]].last_viewed_at;

      this.newMessageDate = mmChannelIdList
        .map(channelId => this.messageCountMas[channelId]?.last_viewed_at || 0) // `undefined`をエポック（0）に変換
        .reduce((min, time) => Math.min(min, time), Infinity); // 最小値を取得

      if (this.newMessageDate === Infinity) {
        this.newMessageDate = 0; // 全て`undefined`ならエポックタイムを設定
      } else { }
    }

    this.setTitle();

    // 入力エリアの初期値設定
    this.inDto.main.message = '';
    this.inDto.main.fileList = [];
    // draftから復元 これは正規の流れと切り離してもいいような気がするのでここで打つ。
    if (mmChannelIdList.length === 1) {
      // チャネル数が1の時だけドラフトを取るF
      from(
        Array
          // ダイレクトの時はチームが不明なので、とりあえず先頭のチームを選択する（0はtimelinie、1はdirectなので2を取る）
          .from(new Set(this.selectedChannelIds.map(channelId => this.mmChannelMas[channelId].team_id).map(team_id => team_id === 'direct' ? this.mmTeamMas[Object.keys(this.mmTeamMas)[2]].id : team_id)))
          .map(team_id => this.apiMattermostService.mattermostGetDrafts(team_id))
      ).pipe(
        mergeMap(_ => _, 1), // worker=1
        tap(drafts => drafts.forEach(draft => this.draftMap[draft.channel_id] = draft)),
        toArray(),
        tap(_ => {
          const draft = this.draftMap[mmChannelIdList[0]];
          if (draft) {
            this.inDto.main.message = draft.message;
            // console.log(draft.message);
            this.inDto.main.fileList = draft.file_ids
              .map(file_id => draft.metadata.files.find(file => file.id === file_id))
              .filter(file => !!file).map(file => ({
                id: file.id,
                file: file as any as File, // ごまかし
                fullPath: file.name,
                base64String: `data:${file.mime_type};base64,${file.mini_preview}`,
              }));
          } else { }
        }),
      ).subscribe();
    } else { }

    // from で配列自体のObservableを作ることで mergeMap で並列実行数を絞る。
    return from(mmChannelIdList.filter(chId => this.mmChannelMas[chId] && !this.initializedChannelList.includes(chId)).map(channelId =>
      this.apiMattermostService.mattermostChannelsPosts(channelId, page, perPage, span).pipe(map(channelPosts => ({ channelId, channelPosts })))
    )).pipe(
      mergeMap(request => request, 1), // worker=1みたいなもの
      tap(next => {
        // load済みチャンネルID
        this.initializedChannelList.push(next.channelId);
        if (this.mmChannelPosts[next.channelId]) {
          // 既にある場合は何もしない
        } else {
          this.mmChannelPosts[next.channelId] = [];
        }
        mmChannelPostList.push(next);
      }),
      toArray(),
      finalize(() => { }),
      switchMap(next => {
        // this.mmChannelPosts = {};
        const allPosts = mmChannelPostList.reduce((bef, curr) => ({ ...bef, ...curr.channelPosts.posts }), {} as { [key: string]: Post });
        const userIdSet = new Set<string>();
        const userNameSet = new Set<string>();

        // メンションのみを抽出する正規表現
        // const mentionRegex = /(?:^|\s)(@[a-zA-Z0-9_-]+)/g;
        const mentionRegex = /(?<![a-zA-Z0-9_-])@([a-zA-Z0-9_-]+)/g;

        const allChannelPosts = Object.entries(allPosts)
          // .filter(([key, value]) => value.create_at > Date.now() - span)
          .reduce((bef, [key, value]) => {
            // ポストした人のID
            userIdSet.add(value.user_id);
            // メンション部分を抽出
            const mentions = value.message.match(mentionRegex)?.map((mention) => mention.trim());
            mentions?.forEach(mention => userNameSet.add(mention.slice(1)));

            if (value.metadata) {
              // 絵文字、リアクションのユーザー特定
              const preEmojiMas: { [key: string]: MattermostEmoji } = {};
              (value.metadata.emojis || []).forEach(emoji => {
                preEmojiMas[emoji.name] = emoji;
                userIdSet.add(emoji.creator_id);
              });

              const renewEmojis: MattermostEmoji[] = [];
              const emojiNameMas: { [key: string]: MattermostEmoji } = {};
              (value.metadata.reactions || []).forEach(reaction => {
                if (reaction.emoji_name in emojiNameMas) {
                } else {
                  // 扱いやすいようにemojisに注入しておく。
                  emojiNameMas[reaction.emoji_name] = {
                    id: preEmojiMas[reaction.emoji_name]?.id || '',
                    name: reaction.emoji_name,
                    reactions: [],
                    reactions_text: '', create_at: 0, update_at: 0, delete_at: 0, creator_id: '',
                  };
                  renewEmojis.push(emojiNameMas[reaction.emoji_name]);
                }
                emojiNameMas[reaction.emoji_name].reactions?.push({ user_id: reaction.user_id, nickname: '' });
                userIdSet.add(reaction.user_id);
              });
              // 整形したemojiで上書き。
              value.metadata.emojis = renewEmojis;
            } else { }

            if (value.channel_id in bef) {
            } else {
              bef[value.channel_id] = [];
            }
            bef[value.channel_id].push(value);
            return bef;
          }, {} as { [key: string]: Post[] });
        this.mmPosts = { ...this.mmPosts, ...allPosts };
        this.mmChannelPosts = { ...this.mmChannelPosts, ...allChannelPosts }
        // console.log(this.mmChannelPosts);
        return this.apiMattermostService.getUsersByIdsOrNamesSet(userIdSet, userNameSet).pipe(
          tap(
            next => {
              // console.log(next);
              const mmUserMas = next.reduce((bef, curr) => {
                bef[curr.id] = curr;
                bef[curr.username] = curr; // 使い分けが面倒なのでusernameもセットで入れてしまう。どうせ被ることはないから大丈夫。
                return bef;
              }, this.mmUserMas);

              // メンション部分をマスタデータで置換する関数
              function replaceMentionsWithMaster(text: string): string {
                // return text.replace(mentionRegex, (match) => {
                //   const mention = match.trim().slice(1);
                //   return ` <a>@${mmUserMas[mention] ? mmUserMas[mention].nickname : mention}</a> `; // マスタに存在すれば置換、なければそのまま
                // });
                return text.replace(mentionRegex, (match) => {
                  const mention = match.trim().slice(1);
                  // マスタに存在すれば置換、なければそのまま
                  if (mmUserMas[mention]) {
                    return ` <a>@${mmUserMas[mention].nickname}</a> `;
                  } else if (['all', 'here', 'channel'].includes(mention)) {
                    return ` <a>@${mention}</a> `;
                  } else {
                    return `@${mention}`;
                  }
                });
              }

              const mmSerializedPostList = [] as Post[];
              Object.entries(allChannelPosts).forEach(([channelId, posts]) => {
                posts.forEach(post => {
                  // href="
                  post.messageForView = post.message;
                  // post.messageForView = post.messageForView.replace('<a href="', '<a target="_blank" href="');
                  post.messageForView = replaceMentionsWithMaster(post.messageForView);
                  // post.messageForView = '\n' + Utils.splitCodeBlock(post.messageForView).map((block, index) => {
                  //   if (index % 2 == 0) {
                  //     return block.split('\n').map(line => {
                  //       if (line.trim()[0] === '|' && line.trim()[line.trim().length - 1] === '|') {
                  //         return line;
                  //       } else {
                  //         return line + '\n';
                  //       }
                  //     }).join('\n');
                  //   } else {
                  //     return '```\n' + block.trim() + '\n```\n';
                  //   }
                  // }).join('') + '\n';
                });
              });

              this.mmGroupedSerializedPostList = [];
              this.mmGroupedFilteredPostList = [];
              this.mmGroupedFilteredLimitedPostList = [];
              Object.values(this.mmChannelPosts).forEach(posts => posts.forEach(post => {
                mmSerializedPostList.push(post);
              }));
              // Object.values(this.mmChannelPosts).forEach(posts => posts.forEach(post => {
              //   if (this.selectedChannelIds.includes(post.channel_id)) {
              //     // 見えてるやつだけ突っ込む
              //     mmSerializedPostList.push(post);
              //   } else {
              //   }
              // }));
              mmSerializedPostList.sort((a, b) => a.create_at - b.create_at);
              mmSerializedPostList.forEach((post, index) => {
                if (post.metadata && post.metadata.emojis) {
                  post.metadata.emojis.forEach(emoji => {
                    emoji.reactions_text = emoji.reactions?.map(reaction => this.mmUserMas[reaction.user_id]?.nickname).join(', ')
                  })
                } else { }
                const bef = mmSerializedPostList[index - 1];
                if (bef) {
                  if (post.channel_id === bef.channel_id && post.user_id == bef.user_id && post.root_id === bef.root_id && post.create_at - bef.create_at < 1000 * 60 * 2) {
                    // 1個前のやつにくっつける
                    this.mmGroupedSerializedPostList.at(-1)!.push(post);
                  } else {
                    this.mmGroupedSerializedPostList.push([post]);
                  }
                } else {
                  this.mmGroupedSerializedPostList.push([post]);
                }
              });

              this.mmThreadMas = {};
              this.mmGroupedSerializedPostList.forEach(g => {
                if (g[0].root_id) {
                  if (g[0].root_id in this.mmThreadMas) {
                  } else {
                    this.mmThreadMas[g[0].root_id] = [];
                  }
                  this.mmThreadMas[g[0].root_id].push(g);
                } else {
                  // root_idの指定なし＝threadじゃないので一個入れておしまい
                  this.mmThreadMas[g[0].id] = [g];
                  g[0].root_id = g[0].id; // root_idが空なので自分を入れておく
                }
              });

              this.mmGroupedFilteredPostList = this.mmGroupedSerializedPostList.filter(postGroup => this.selectedChannelIds.includes(postGroup[0].channel_id));
              this.setPostCountFiilter(this.mmGroupedFilteredPostList);
              this.scrollToBottom(true);
            }
          ))
      })
    );
  }
  // ドラフトのマップ
  draftMap: { [channel_id: string]: MattermostPost } = {};

  viewThread(post: Post): void {
    if (this.mmThread && this.mmThread.length > 0 && this.mmThread[0].length > 0 && this.mmThread[0][0].root_id === post.root_id) {
      // TODO 消すときの挙動が不明
      this.mmThread = [];
    } else {
      this.mmThread = this.mmThreadMas[post.root_id];
      // thread用のスクローラを最下端に持っていく
      setTimeout(() => {
        this.rScroll().nativeElement.scrollTop = this.rScroll().nativeElement.scrollHeight;
        this.textAreaElemThread().nativeElement.focus();
      }, 500);
    }
  }

  readonly textAreaElemMain = viewChild.required<ElementRef<HTMLTextAreaElement>>('textAreaElemMain');

  readonly textAreaElemThread = viewChild.required<ElementRef<HTMLTextAreaElement>>('textAreaElemThread');

  readonly scroll = viewChild.required<ElementRef<HTMLDivElement>>('scroll');

  readonly rScroll = viewChild.required<ElementRef<HTMLDivElement>>('rScroll');

  selectChannel(mmChannelId: string): Observable<any> {
    const selectedChannels = [mmChannelId];
    this.selectedChannelIds = selectedChannels;
    return this.mmLoadChannels([mmChannelId]);
  }

  isSameDate(_date1: number, _date2: number): boolean {
    const date1 = new Date(_date1);
    const date2 = new Date(_date2);
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  //
  inDto: InDto = {
    main: { message: '', fileList: [] },
    thread: { message: '', fileList: [] },
  };
  post(type: InType, channel_id: string, root_id?: string): void {
    const targetInDto = { message: this.inDto[type].message, fileList: [...this.inDto[type].fileList] };
    this.inDto[type].message = '';
    this.inDto[type].fileList = [];
    this.apiMattermostService.mattermostCreatePost({ channel_id: channel_id, message: targetInDto.message, file_ids: targetInDto.fileList.map(file => file.id || '').filter(name => name), root_id }).subscribe({
      next: next => {
        // console.log(next);
        this.apiMattermostService.mattermostCreateDraft({ channel_id: channel_id, message: '', file_ids: [], root_id }).subscribe(); // メッセージ送信が成功したらドラフトを消しておく
      },
      error: error => {
        // エラーの時は入力を元に戻す。
        this.inDto[type] = targetInDto;
        this.snackBar.open(`投稿できませんでした。`, 'close', { duration: 3000 });
      },
    });
  }

  reaction(post: Post, emoji_name: string): void {
    // 既にある場合はdelete、無い場合はcreate
    const isDelete = post.metadata.reactions?.find(reaction => reaction.emoji_name === emoji_name && reaction.user_id === this.apiMattermostService.mmUser?.id);
    (isDelete
      ? this.apiMattermostService.mattermostRemoveReaction(post.id, emoji_name)
      : this.apiMattermostService.mattermostCreateReaction(post.id, emoji_name)
    ).subscribe({
      next: next => { }
    });
  }

  postDelete(post: Post): void {
    this.dialog.open(DialogComponent, {
      data: { title: `確認`, message: `メッセージを削除しますか？`, options: ['キャンセル', 'OK'] }
    }).afterClosed().subscribe({
      next: next => {
        if (next === 1) {
          this.apiMattermostService.mattermostDeletePost(post.id).subscribe();
        } else[
          //
        ]
      }
    });
  }
  // メンションリストのスクロールを操作するのに使う
  readonly mentionElems = viewChildren<ElementRef>('mentionElem');
  timeoutId: any;
  onKeyDown(type: InType, $event: KeyboardEvent, channel_id: string, root_id?: string): void {
    if (this.mentionPosition) {
      // メンション表示中であればメンション部分の操作をする

      let isArrowType = false;
      // 上を押したらmentionListの選択を上に移動
      if (this.mentionList.length > 0 && ['ArrowUp', 'ArrowDown'].includes($event.key)) {
        if ($event.key === 'ArrowUp') {
          this.mentionSelectorIndex = Math.max(this.mentionSelectorIndex - 1, 0);
        } else if ($event.key === 'ArrowDown') {
          this.mentionSelectorIndex = Math.min(this.mentionSelectorIndex + 1, this.mentionList.length - 1);
        }

        // 選択変更後、次のレンダリングサイクルで要素をスクロール
        setTimeout(() => {
          const elements = this.mentionElems();
          if (elements[this.mentionSelectorIndex]) {
            elements[this.mentionSelectorIndex].nativeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } else { }
        });
        isArrowType = true;

        $event.preventDefault();
        return;
      }
      if ($event.key === 'Escape') {
        this.clearMention();
        return;
      }
      if ($event.key === 'Enter') {
        const mentionKeyword = this.mentionList[this.mentionSelectorIndex].username;
        this.setMention(type, mentionKeyword);
        $event.preventDefault();
      } else {

        if (!isArrowType) setTimeout(() => { this.checkMention(type); }, 0);

        this.onChange(type, channel_id, root_id);
      }
    } else {
      // メンション表示中ではない場合。
      if ($event.key === 'Enter') {
        if ($event.shiftKey) {
          this.onChange(type, channel_id, root_id);
        } else if ((this.userService.enterMode === 'Ctrl+Enter' && $event.ctrlKey) || this.userService.enterMode === 'Enter') {
          this.post(type, channel_id, root_id);
        } else {
          // なんかしらんがEnterだと文字が消えないことが多いのできっぱりCtrl+Enterだけにする。
          // this.post(type, channel_id, root_id);
        }
      } else {

        setTimeout(() => { this.checkMention(type); }, 0);

        this.onChange(type, channel_id, root_id);
      }
    }
  }

  setMention(type: InType, mentionKeyword: string): void {
    let inputElement: HTMLTextAreaElement;
    if (type === 'main') {
      inputElement = this.textAreaElemMain().nativeElement;
    } else if (type === 'thread') {
      inputElement = this.textAreaElemThread().nativeElement;
    } else { return; }
    const inputText = this.inDto[type].message;
    const left = inputText.substring(0, this.mentionAtIndex);
    const right = inputText.substring(inputElement.selectionStart || 0);
    this.inDto[type].message = left + `@${mentionKeyword} ` + right;
    this.clearMention();
  }

  checkMention(type: InType): void {
    let inputElement: HTMLTextAreaElement;
    let channel_id: string;
    let root_id: string | undefined;

    if (type === 'main') {
      inputElement = this.textAreaElemMain().nativeElement;
      channel_id = this.selectedChannelIds[0];
      root_id = undefined;
    } else if (type === 'thread') {
      inputElement = this.textAreaElemThread().nativeElement;
      channel_id = this.mmThread[0][0].channel_id;
      root_id = this.mmThread[0][0].id;
    } else { return; }

    if (inputElement.selectionStart === inputElement.selectionEnd) {
      // シングルカーソルの時だけOK
    } else {
      // 文字列選択しているときはメンションoff
      this.clearMention();
      return;
    }

    const leftText = this.inDto[type].message.substring(0, inputElement.selectionStart || 1);
    // 簡単に言うと、カーソル左側の文字列を末尾から英数記号の連続する限り切り出して、その先頭が単一の@である場合のみをメンションの発動条件とする。
    const match = leftText.match(/[A-Za-z0-9_.@-]+$/); // メンション文字列として使用可能な文字の連続を取得する。
    // console.log(`leftText=${leftText}`);
    if (match && match[0] && match[0].lastIndexOf('@') === 0) { // lastIndexOfで@位置を取得し、0であれば文字列中唯一の@が先頭に存在することを担保できる
      this.mentionAtIndex = leftText.length - match[0].length;
      this.mentionPosition = this.cursorPosition;

      const mentionText = match[0].substring(1);
      // console.log(mentionText);

      const team = this.mmTeamMas[this.mmChannelMas[channel_id].team_id];
      const teamId = team.id === 'direct' ? this.mmTeamList[2].id : (team.id === 'timeline' ? this.mmChannelMas[channel_id].team_id : team.id);

      if (this.mentionKeyword && mentionText.startsWith(this.mentionKeyword) && this.mentionList.length === 0) {
        // 前方一致検索なのでヒットしなかったメンションキーワードなら追加入力を無視する。
        this.clearMention();
      } else {
        if (this.mentionTimeout) {
          this.mentionTimeout.unsubscribe();
        } else { }
        //
        let threadUserList: MattermostUser[] = [];
        if (this.mentionList.length === 0 && root_id) {
          // 元が0件でthreadの場合はthreadのユーザーを取ってきて追加しておく。
          threadUserList = Array.from(new Set(this.mmThreadMas[root_id].map(posts => posts.map(post => post.user_id)).flat().reverse())).map(user_id => this.mmUserMas[user_id]).filter(user => user);
          this.mentionList = threadUserList;
        } else {/** mainもしくは元々なんか入ってる場合はそのまま継続 */ }
        this.mentionTimeout = this.apiMattermostService.mattermostUserAutocomplete(teamId, channel_id, mentionText).subscribe({
          next: next => {
            // console.log(next);
            this.mentionInputType = type;
            this.mentionSelectorIndex = 0;

            const presetUserIds = threadUserList.map(user => user.id);
            presetUserIds.push(this.mmUser.providerUserId); // 自分は一旦除外

            // presetUserIdsを除外して追加
            this.mentionList = [...threadUserList, ...next.users.filter(user => !presetUserIds.includes(user.id))];

            // 自分が居たら末尾に追加
            const currentUser = next.users.find(user => user.id === this.mmUser.providerUserId);
            if (currentUser) {
              this.mentionList.push(currentUser); // 自分を末尾に追加
            } else { }
            this.mentionKeyword = mentionText;
            next.users.forEach(user => user.roles = user.roles.replaceAll(/.* /g, ''));

            const special = [
              { email: '', first_name: '', last_name: '', roles: 'special', id: 'here', username: 'here', nickname: 'Notifies everyone in this channel' },
              { email: '', first_name: '', last_name: '', roles: 'special', id: 'channel', username: 'channel', nickname: 'Notifies everyone in this channel' },
              { email: '', first_name: '', last_name: '', roles: 'special', id: 'all', username: 'all', nickname: 'Notifies everyone in this channel' },
            ] as MattermostUser[];
            special.filter(user => user.username.startsWith(mentionText)).forEach(user => this.mentionList.push(user));

            // // スレッド内の最後の発言者を取得して先頭に移動
            // if (type === 'thread' && this.mmThreadMas[root_id || '']) {
            //   const threadList = this.mmThreadMas[root_id || ''];
            //   const lastPostUserId = threadList.at(-1)![0].user_id;

            //   // 最後の発言者をリストから探して先頭に移動
            //   const lastPosterIndex = this.mentionList.findIndex(user => user.id === lastPostUserId);
            //   if (lastPosterIndex !== -1) {
            //     const lastPoster = this.mentionList.splice(lastPosterIndex, 1)[0];
            //     this.mentionList.unshift(lastPoster);
            //   }
            // } else { }

          },
          error: error => {
            this.clearMention();
          },
        });
      }
    } else {
      this.clearMention();
    }
  }

  mentionUserMaster: { [name: string]: MattermostUser } = {};
  mentionKeyword: string = '';
  mentionList: MattermostUser[] = [];
  mentionPosition?: { x: number, y: number };
  mentionAtIndex: number = -1;
  mentionSelectorIndex: number = -1;
  mentionInputType: 'main' | 'thread' = 'main';
  mentionTimeout: Subscription | null = null;

  clearMention(): void {
    this.mentionAtIndex = -1;
    this.mentionSelectorIndex = -1;
    this.mentionList = [];
    this.mentionKeyword = '';
    this.mentionPosition = undefined;
  }

  onChange(type: InType, channel_id: string, root_id?: string): void {
    // textareaの縦幅更新。遅延打ちにしないとvalueが更新されていないので0遅延打ち。
    setTimeout(() => {
      // テキストボックスの高さ調整
      if (type === 'main') {
        this.textAreaElemMain() && DomUtils.textAreaHeighAdjust(this.textAreaElemMain().nativeElement); // 高さ調整
      } else if (type === 'thread') {
        this.textAreaElemThread() && DomUtils.textAreaHeighAdjust(this.textAreaElemThread().nativeElement); // 高さ調整
      }
    }, 0);

    // 最後の変更検知から1000秒後にonChangeが動くようにする。1000秒経たずにここに来たら前回のタイマーをキャンセルする
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      const targetInDto = { message: this.inDto[type].message, fileList: [...this.inDto[type].fileList] };
      this.apiMattermostService.mattermostCreateDraft({ channel_id: channel_id, message: targetInDto.message, file_ids: targetInDto.fileList.map(file => file.id || '').filter(name => name), root_id }).subscribe();
      this.apiMattermostService.mattermostTyping(channel_id, root_id);
    }, 1000);
  }
  cursorPosition: { x: number, y: number } = { x: 0, y: 0 };
  onCursorPositionChange($event: { x: number, y: number }): void {
    // console.log($event);
    this.cursorPosition = $event;
  }

  // @ViewChildren(FileDropDirective)
  // appFileDropList?: QueryList<FileDropDirective>;

  readonly appFileDropList = viewChildren<FileDropDirective>(FileDropDirective);

  onFilesDropped(type: InType, channel_id: string, files: FullPathFile[]): Subscription {
    // // 複数ファイルを纏めて追加したときは全部読み込み終わってからカウントする。
    // this.tokenObj.totalTokens = -1;
    // this.isLock = true;
    // mattermostにアップロードするのでなんとなくフルパスじゃなくてbasenameにしておく。
    files.forEach(file => file.fullPath = file.fullPath.split('/').pop() || '');
    // 先に枠だけ作ってしまう。
    files.forEach(file => this.inDto[type].fileList.push(file));
    return this.apiMattermostService.mattermostFilesUpload(channel_id, files)
      .subscribe({
        next: next => {
          next.forEach((res, index) => {
            res.file_infos.forEach(fileInfo => {
              files[index].id = fileInfo.id;
              if (fileInfo.mime_type.startsWith('image/')) {
                // console.log(files[index].base64String);
                // files[index].base64String = `data:${fileInfo.mime_type};base64,${files[index].fullPath}`;
              }

              // this.inDto[type].fileList[indexPlaceholder + index] = files[index];
              // this.inDto[type].fileList.push(files[index]);
            });
          });
          // this.isLock = false;
        },
        error: error => {
          this.snackBar.open(`アップロードエラーです\n${JSON.stringify(error)}`, 'close', { duration: 30000 });
          // this.isLock = false;
        },
      });
  }

  /** イベント伝播しないように止める */
  stopPropagation($event: Event): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }
}
