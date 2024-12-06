import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';

import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MattermostTimelineService, ToAiFilterType, ToAiIdType } from '../../services/api-mattermost.service';
import { ProjectService } from '../../services/project.service';
import { Project } from '../../models/project-models';
import { MatSnackBar } from '@angular/material/snack-bar';

type ShortcutType = 'today' | 'fromYesterday' | 'yesterday' | 'thisWeek' | 'lastWeek';

@Component({
  selector: 'app-mm-message-selector-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    MatTabsModule,
    MatDatepickerModule,  // 日付ピッカー用のモジュール
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatSliderModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  providers: [],
  templateUrl: './mm-message-selector-dialog.component.html',
  styleUrls: ['./mm-message-selector-dialog.component.scss']
})
export class MmMessageSelectorDialogComponent {

  readonly projectService: ProjectService = inject(ProjectService);
  readonly mattermostTimelineService: MattermostTimelineService = inject(MattermostTimelineService);
  readonly dialogRef: MatDialogRef<MmMessageSelectorDialogComponent> = inject(MatDialogRef);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly data = inject<{ title: string, channelCount: number, id: string, idType: ToAiIdType }>(MAT_DIALOG_DATA);

  isLoading = false;
  systemPrompt: string = `チャットを要約してください。`;
  projectList: Project[] = [];
  projectId: string = '';

  selectedIndex: number = 0;

  countForm: FormGroup;
  timeForm: FormGroup;
  change(a: any): void {
    console.log(a);
  }

  // ショートカットのオプション
  timeShortcuts: { label: string, value: ShortcutType }[] = [
    { label: '今日', value: 'today' },
    { label: '前日～現在', value: 'fromYesterday' },
    { label: '前日', value: 'yesterday' },
    { label: '今週', value: 'thisWeek' },
    { label: '先週', value: 'lastWeek' },
  ];

  constructor(private fb: FormBuilder) {
    this.countForm = this.fb.group({
      // 1チャネル当たり60が上限
      // this.data.channelCount
      messageCount: [60, [Validators.required, Validators.min(1), Validators.max(200)]]
    });

    this.timeForm = this.fb.group({
      timeShortcut: [], // ショートカット
      // startDate: [Utils.formatDate(new Date(), 'yyyy/MM/d')],
      startDate: [new Date()],
      startTime: ['00:00'], // 開始時間
      endDate: [new Date()],
      endTime: ['23:59'] // 終了時間
    });

    this.isLoading = true;
    this.projectService.getProjectList().subscribe({
      next: next => {
        this.isLoading = false;
        this.projectList = next;
        this.projectId = next[0].id;
      },
    });
  }
  // ショートカットが選択されたときに日時を設定
  onTimeShortcutChange(shortcut: { value: ShortcutType }): void {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    // 月曜日始まりの週の初めの日を算出
    const firstDay = new Date(today);
    firstDay.setDate(today.getDate() - ((today.getDay() + 6) % 7));  // 月曜日始まり

    switch (shortcut.value) {
      case 'today':
        this.timeForm.patchValue({ startDate: today, endDate: today });
        break;
      case 'fromYesterday':
        this.timeForm.patchValue({ startDate: yesterday, endDate: today });
        break;
      case 'yesterday':
        this.timeForm.patchValue({ startDate: yesterday, endDate: yesterday, endTime: '23:59' });
        break;
      case 'thisWeek':
        this.timeForm.patchValue({ startDate: firstDay, endDate: today });
        break;
      case 'lastWeek':
        const lastWeekFirstDay = new Date(firstDay);
        lastWeekFirstDay.setDate(firstDay.getDate() - 7);
        const lastWeekLastDay = new Date(firstDay);
        lastWeekLastDay.setDate(firstDay.getDate() - 1);
        this.timeForm.patchValue({ startDate: lastWeekFirstDay, endDate: lastWeekLastDay });
        break;
    }
  }

  apply(): void {
    let filterType: ToAiFilterType = 'batch';
    const params: any = {};
    switch (this.selectedIndex) {
      case 0:
        const startHm = this.timeForm.value.startTime.split(':');
        const endHm = this.timeForm.value.endTime.split(':');
        this.timeForm.value.startDate.setHours(startHm[0] - 9, startHm[1], 0, 0); // JSTなので-9しないとダメ
        this.timeForm.value.endDate.setHours(endHm[0] - 9, endHm[1], 0, 0); // JSTなので-9しないとダメ
        params.timespan = {
          start: this.timeForm.value.startDate.getTime(),
          end: this.timeForm.value.endDate.getTime(),
        };
        filterType = 'timespan';
        break;
      case 1:
        filterType = 'count';
        params.count = this.countForm.value.messageCount;
        break;
      case 2:
        filterType = 'batch';
        break;
    }
    this.isLoading = true;
    this.mattermostTimelineService.mattermostToAi(this.projectId, this.data.id, this.data.idType, filterType, params, this.systemPrompt).subscribe({
      next: next => {
        this.dialogRef.close({ filterType, thread: next.thread });
        this.isLoading = false;
      },
      error: error => {
        this.snackBar.open(`指定された期間にはメッセージがありません。`, 'close', { duration: 3000 });
        this.isLoading = false;
      }
    });
  }
}
