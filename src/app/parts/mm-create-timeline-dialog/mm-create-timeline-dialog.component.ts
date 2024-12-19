import { MattermostTimeline, MattermostTimelineService } from '../../services/api-mattermost.service';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';

import { ApiMattermostService, MattermostChannelForView, MattermostTeamForView } from '../../services/api-mattermost.service';
import { DialogComponent } from '../dialog/dialog.component';
import { MmTeamLogoComponent } from '../mm-team-logo/mm-team-logo.component';
import { Utils } from '../../utils';

@Component({
    selector: 'app-mm-create-timeline-dialog',
    imports: [
        CommonModule, FormsModule,
        MatFormFieldModule, MatInputModule, MatCheckboxModule, MatSelectModule, MatSnackBarModule, MatAutocompleteModule, MatExpansionModule, MatIconModule,
        MmTeamLogoComponent,
    ],
    templateUrl: './mm-create-timeline-dialog.component.html',
    styleUrl: './mm-create-timeline-dialog.component.scss'
})
export class MmCreateTimelineDialogComponent {

  readonly dialog: MatDialog = inject(MatDialog);
  readonly dialogRef: MatDialogRef<MmCreateTimelineDialogComponent> = inject(MatDialogRef<MmCreateTimelineDialogComponent>);
  readonly data = inject<{ mmTimeline: MattermostTimeline, mmTeamList: MattermostTeamForView[] }>(MAT_DIALOG_DATA);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly apiMattermostService: ApiMattermostService = inject(ApiMattermostService);
  readonly mattermostTimelineService: MattermostTimelineService = inject(MattermostTimelineService);

  mmTeamMas: { [keyt: string]: MattermostTeamForView } = {};
  mmTeamList: MattermostTeamForView[] = [];
  mmChannelList: MattermostChannelForView[] = [];
  title: string = '';
  id?: string = '';

  constructor() {
    // この画面は破壊的なのでクローンを取っておく。
    this.mmTeamList = this.data.mmTeamList.map(mmTeam => Utils.clone(mmTeam));
    const set = new Set<string>();
    if (this.data.mmTimeline) {
      // 編集
      this.data.mmTimeline.channels.forEach(ch => set.add(ch.channelId));
      this.title = this.data.mmTimeline.title;
      this.id = this.data.mmTimeline.id;
    } else {
      // 新規
    }
    // console.log(set);
    this.mmTeamMas = this.mmTeamList.reduce((res, curr) => {
      res[curr.id] = curr;
      // console.log(res[curr.id].channelList);
      const checkList = res[curr.id].channelList.filter(ch => {
        ch.isChecked = set.has(ch.id);
        return ch.isChecked;
      });
      // console.log(checkList);
      res[curr.id].isChecked = checkList.length === 0 ? 0 : (checkList.length === res[curr.id].channelList.length ? 2 : 1);
      res[curr.id].channelList.forEach(ch => this.mmChannelList.push(ch));
      return res;
    }, {} as { [key: string]: MattermostTeamForView });
  }

  removeTimeline(): void {
    this.dialog.open(DialogComponent, { data: { title: 'タイムライン削除', message: 'タイムラインを削除しますか？', options: ['キャンセル', 'OK'] } }).afterClosed().subscribe(result => {
      if (result === 1 && this.id) {
        this.mattermostTimelineService.deleteTimeline(this.id).subscribe({
          next: next => {
            console.log(next);
            this.dialogRef.close({ id: this.id, action: 'delete' });
          }
        });
      } else { }
    });
  }

  registTimeline(): void {
    const maxSize = 10;
    if (!this.title) {
      // 必須入力チェック
      this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `タイムライン名を入力してください。`, options: ['OK'] } }).afterClosed().subscribe({ next: next => { } });
    } else if (this.mmChannelList.filter(ch => ch.isChecked).length > maxSize) {
      // 件数チェック
      this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `選択件数を${maxSize}件以下にしてください。`, options: ['OK'] } }).afterClosed().subscribe({ next: next => { } });
    } else {
      if (this.id) {
        // this.teamService.updateTeamMember(this.team.id, this.teamMember.id, this.teamMember).subscribe(this.subscriber('更新'));
        this.mattermostTimelineService.updateTimeline(this.id, { title: this.title, channelIds: this.mmChannelList.filter(ch => ch.isChecked).map(ch => ch.id) }).subscribe({
          next: next => {
            this.snackBar.open('更新しました', 'OK', { duration: 3000 });
            this.dialogRef.close(next);
          },
          error: error => {
            this.snackBar.open('更新に失敗しました', 'OK', { duration: 3000 });
          },
        });
      } else {
        this.mattermostTimelineService.createTimeline({ title: this.title, channelIds: this.mmChannelList.filter(ch => ch.isChecked).map(ch => ch.id) }).subscribe({
          next: next => {
            this.snackBar.open('登録しました', 'OK', { duration: 3000 });
            this.dialogRef.close(next);
          },
          error: error => {
            this.snackBar.open('登録に失敗しました', 'OK', { duration: 3000 });
          },
        });
      }
    }
  }

  // dragging: boolean = false;
  // lastCheckedIndex: number = -1;
  // onMouseDown(index: number) {
  //   this.dragging = true;
  //   this.lastCheckedIndex = index;
  // }
  // onMouseOver(index: number) {
  //   if (this.dragging) {
  //     this.checkRange(this.lastCheckedIndex, index);
  //   } else { }
  // }
  // onMouseUp() {
  //   this.dragging = false;
  // }
  // checkRange(startIndex: number, endIndex: number) {
  //   const start = Math.min(startIndex, endIndex);
  //   const end = Math.max(startIndex, endIndex);
  //   for (let i = start; i <= end; i++) {
  //     // this.items[i].checked = !this.items[startIndex].checked;
  //   }
  // }

  changeChannel(mmChannel: MattermostChannelForView): void {

  }

  eventCancel($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }

  checkChannel(channel: MattermostChannelForView): void {
    channel.isChecked = !channel.isChecked;
    this.updateTeamCheckFlag(this.mmTeamMas[channel.team_id]);
  }

  updateTeamCheckFlagAll(): void {
    Object.entries(this.mmTeamMas).forEach(([key, mmTeam]) => this.updateTeamCheckFlag(mmTeam));
  }
  updateTeamCheckFlag(mmTeam: MattermostTeamForView): void {
    const flagSet = new Set<boolean>();
    mmTeam.channelList.forEach(channel => flagSet.add(channel.isChecked));
    mmTeam.isChecked = flagSet.size === 2 ? 1 : ([...flagSet][0] ? 2 : 0);
  }

  checkTeam($event: MouseEvent, mmTeam: MattermostTeamForView): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();

    function updateCheck(mmTeam: MattermostTeamForView) {
      mmTeam.isChecked = mmTeam.isChecked === 0 ? 2 : 0;
      mmTeam.channelList.forEach(channel => channel.isChecked = !!mmTeam.isChecked);
    }
    if (mmTeam.isChecked === 1) {
      this.dialog.open(DialogComponent, { data: { title: '一括チェック', message: 'チェックを状態を一括で変更します。', options: ['キャンセル', 'OK'] } }).afterClosed().subscribe({
        next: next => {
          if (next === 1) {
            updateCheck(mmTeam);
          } else { }
        }
      });
    } else {
      updateCheck(mmTeam);
    }
  }

}
