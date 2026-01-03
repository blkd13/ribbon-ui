import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { ToolCallService } from '../../../../services/tool-call.service';
import { ExtApiStatusService } from '../../../../services/ext-api-status.service';
import { Thread, ThreadGroupForView } from '../../../../models/project-models';

@Component({
  selector: 'app-tool-integration',
  template: `<!-- Template will be extracted from main component -->`,
  standalone: true
})
export class ToolIntegrationComponent {
  @Input() selectedThreadGroup!: ThreadGroupForView;
  @Input() toolGroupStates: { [groupName: string]: boolean } = {};
  @Input() toolGroupLoadingStates: { [groupName: string]: boolean } = {};

  @Output() toolGroupStateChanged = new EventEmitter<{ groupName: string, enabled: boolean }>();
  @Output() toolGroupLoadingChanged = new EventEmitter<{ groupName: string, loading: boolean }>();
  @Output() systemPanelSyncRequested = new EventEmitter<void>();

  readonly toolCallService = inject(ToolCallService);
  readonly extApiStatusService = inject(ExtApiStatusService);
  readonly snackBar = inject(MatSnackBar);

  // ツールグループと外部プロバイダーのマッピング
  private readonly toolGroupProviderMapping: { [groupName: string]: string } = {
    'mattermost': 'mattermost',
    'box': 'box',
    'gitlab': 'gitlab',
    'gitea': 'gitea',
    'web': '', // No external provider required
    'tool': '', // No external provider required
    'jira': 'API_KEY', // No external provider required
    'confluence': 'API_KEY' // No external provider required
  };

  /**
   * ツールグループの状態を初期化
   */
  initializeToolGroupStates(): void {
    this.toolCallService.tools.forEach(group => {
      const isGroupEnabled = this.selectedThreadGroup?.threadList.some(thread => {
        if (!thread.inDto.args.tools) return false;
        
        const groupDef = this.toolCallService.tools.find(tool => tool.group === group.group);
        if (!groupDef) return false;

        // 何かしらのツールが選択されている場合は、グループの状態を自動でONにする
        thread.inDto.args.tool_choice = 'auto';
        
        // グループ内の全ツールが有効かどうかをチェック
        return groupDef.tools.every(tool =>
          thread.inDto.args.tools!.find(t => t.function.name === tool.definition.function.name)
        );
      }) || false;

      this.toolGroupStates[group.group] = isGroupEnabled;
    });

    // system-panelの状態も同期する
    setTimeout(() => {
      this.systemPanelSyncRequested.emit();
    }, 100);
  }

  /**
   * ツールグループの状態を切り替える
   */
  async toggleToolGroup(groupName: string): Promise<void> {
    const newState = !this.toolGroupStates[groupName];

    // ローディング状態を開始
    this.toolGroupLoadingStates[groupName] = true;
    this.toolGroupLoadingChanged.emit({ groupName, loading: true });

    try {
      // ONにする場合は接続性チェックを実行
      if (newState) {
        const canEnable = await this.checkToolGroupConnectivity(groupName);
        if (!canEnable) {
          return;
        }
      }

      // 接続確認が完了したらツールグループの状態を更新
      this.toolGroupStates[groupName] = newState;
      this.toolGroupStateChanged.emit({ groupName, enabled: newState });

      // 全スレッドに適用
      this.applyToolGroupStateToThreads(groupName, newState);

      // system-panelの状態も同期する
      this.systemPanelSyncRequested.emit();
    } finally {
      // ローディング状態を終了
      this.toolGroupLoadingStates[groupName] = false;
      this.toolGroupLoadingChanged.emit({ groupName, loading: false });
    }
  }

  /**
   * ツールグループの現在状態を取得
   */
  isToolGroupEnabled(groupName: string): boolean {
    return this.toolGroupStates[groupName] || false;
  }

  /**
   * ツールグループのローディング状態を取得
   */
  isToolGroupLoading(groupName: string): boolean {
    return this.toolGroupLoadingStates[groupName] || false;
  }

  /**
   * 利用可能なツールグループを取得
   */
  getAvailableToolGroups(): any[] {
    return this.toolCallService.tools || [];
  }

  private async checkToolGroupConnectivity(groupName: string): Promise<boolean> {
    const providerType = groupName.split('-')[0]; // グループ名からプロバイダーを取得
    const providerName = groupName.substring(groupName.indexOf('-') + 1); // グループ名からプロバイダー名を取得
    const requiredProvider = this.toolGroupProviderMapping[providerType]; // グループ名からプロバイダーを取得

    if (requiredProvider === 'API_KEY') {
      // 接続されていない場合は警告を表示してONにしない
      this.showConnectionPrompt(groupName, requiredProvider);
      return false;
    } else if (requiredProvider) {
      const isConnected = await this.checkProviderConnectivity(requiredProvider, providerName);
      
      if (!isConnected) {
        // 接続されていない場合は警告を表示してONにしない
        this.showConnectionPrompt(groupName, requiredProvider);
        return false;
      }
    }
    
    return true;
  }

  private async checkProviderConnectivity(providerType: string, providerName: string): Promise<boolean> {
    try {
      // プロバイダーが必要ない場合は常にtrue
      if (!providerType) {
        return true;
      }

      // プロバイダー識別子を構築（例: box-default, gitlab-local）
      const provider = `${providerType}-${providerName}`;

      // 新しいAPIで接続テストを実行
      const result = await firstValueFrom(this.extApiStatusService.checkConnection(provider));

      // connected かつ verified が true の場合のみ接続成功
      return result.connected && result.verified;
    } catch (error) {
      console.error('Provider connectivity check failed:', error);
      return false;
    }
  }

  private showConnectionPrompt(groupName: string, providerType: string): void {
    const message = `${groupName}ツールを使用するには${providerType}の連携が必要です。右上のメニューからAPI連携を設定してください。`;

    console.warn(message);

    this.snackBar.open(message, '閉じる', {
      duration: 5000,
      panelClass: ['mat-toolbar', 'mat-warn'],
      horizontalPosition: 'center',
      verticalPosition: 'top'
    });
  }

  private applyToolGroupStateToThreads(groupName: string, enabled: boolean): void {
    this.selectedThreadGroup.threadList.forEach(thread => {
      if (!thread.inDto.args.tools) {
        thread.inDto.args.tools = [];
      }

      const groupDef = this.toolCallService.tools.find(tool => tool.group === groupName);
      if (groupDef) {
        if (enabled) {
          // ONにする場合：グループ内の全ツールを追加
          groupDef.tools.forEach(tool => {
            const exists = thread.inDto.args.tools!.find(t => t.function.name === tool.definition.function.name);
            if (!exists) {
              thread.inDto.args.tools!.push(tool.definition);
            }
          });
        } else {
          // OFFにする場合：グループ内の全ツールを削除
          groupDef.tools.forEach(tool => {
            thread.inDto.args.tools = thread.inDto.args.tools!.filter(t => t.function.name !== tool.definition.function.name);
          });
        }
      }
      thread.inDto.args.tools = [...thread.inDto.args.tools];
    });
  }

  /**
   * プリセット選択時のツール設定
   */
  applyPresetTools(preset: any): void {
    this.selectedThreadGroup.threadList.forEach((thread, tIndex) => {
      thread.inDto.args.tool_choice = preset.tool_choice || 'none';

      if (preset.tool_clear) {
        thread.inDto.args.tools = [];
      }

      if (preset.tool_names && preset.tool_names.length > 0) {
        const funcMap = this.createToolFunctionMap();
        thread.inDto.args.tools = preset.tool_names.map((toolName: string) => funcMap[toolName]);
      }

      if (preset.tool_groups && preset.tool_groups.length > 0) {
        const funcMap = this.createToolFunctionMap();
        if (thread.inDto.args.tools) {
          for (const group of preset.tool_groups) {
            for (const key of Object.keys(funcMap)) {
              if (key.startsWith(group)) {
                thread.inDto.args.tools.push(funcMap[key]);
              }
            }
          }
        }
      }
    });

    // ツールグループの状態を更新
    this.initializeToolGroupStates();
  }

  private createToolFunctionMap(): { [key: string]: any } {
    return this.toolCallService.tools
      .map(tool => tool.tools)
      .flat()
      .reduce((acc, tool) => {
        acc[`${tool.info.group}:${tool.info.name}`] = tool.definition;
        return acc;
      }, {} as { [key: string]: any });
  }

  /**
   * システム設定編集時のツール同期
   */
  syncToolsAcrossThreads(sourceThread: Thread): void {
    if (this.shouldSyncTools()) {
      this.selectedThreadGroup.threadList.forEach(thread => {
        if (thread.id !== sourceThread.id) {
          // 他のスレッドにコピーする
          thread.inDto.args.tools = sourceThread.inDto.args.tools;
          thread.inDto.args.tool_choice = sourceThread.inDto.args.tool_choice;
          thread.inDto.args.parallel_tool_calls = sourceThread.inDto.args.parallel_tool_calls;
        }
      });
    }
  }

  private shouldSyncTools(): boolean {
    // リンクチェーンの設定に基づいて同期すべきかどうかを判定
    // この実装は親コンポーネントのlinkChain設定に依存します
    return true; // 簡略化のため常にtrue
  }
}