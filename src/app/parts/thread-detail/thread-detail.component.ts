import { DialogRef } from '@angular/cdk/dialog';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';

import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Thread } from '../../models/project-models';

@Component({
    selector: 'app-thread-detail',
    imports: [ReactiveFormsModule, MatInputModule, MatButtonModule],
    templateUrl: './thread-detail.component.html',
    styleUrl: './thread-detail.component.scss'
})
export class ThreadDetailComponent {
  threadForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: DialogRef<ThreadDetailComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { thread: Thread },
  ) {
    ;
    this.threadForm = this.fb.group({
      // title: [data.thread.title || '', Validators.required],
      // description: [data.thread.description || '',]
    });
  }

  onSubmit() {
    if (this.threadForm.valid) {
      console.log('Form Submitted!', this.threadForm.value);
      console.log('Form Submitted!', this.threadForm.value.title);
      console.log('Form Submitted!', this.threadForm.value.description);
      // ここでフォームデータをサーバーに送信するなどの処理を行います。
    }
  }
}
