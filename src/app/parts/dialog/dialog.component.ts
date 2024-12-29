import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { NewlineToBrPipe } from '../../pipe/newline-to-br.pipe';
import { MatButtonModule } from '@angular/material/button';

export interface DialogData {
  title: string;
  message: string;
  options: string[];
}

@Component({
    selector: 'app-dialog',
    imports: [MatDialogModule, MatButtonModule, NewlineToBrPipe],
    templateUrl: './dialog.component.html',
    styleUrl: './dialog.component.scss'
})
export class DialogComponent {

  readonly dialogRef = inject(MatDialogRef<DialogComponent>);
  readonly data = inject<DialogData>(MAT_DIALOG_DATA);

  onClick($index: number): void {
    this.dialogRef.close($index);
  }
}
