import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
    selector: 'app-image-dialog',
    imports: [],
    templateUrl: './image-dialog.component.html',
    styleUrl: './image-dialog.component.scss'
})
export class ImageDialogComponent {
  readonly dialogRef: MatDialogRef<ImageDialogComponent> = inject(MatDialogRef<ImageDialogComponent>);
  readonly data: { fileName: string, imageBase64String: string } = inject(MAT_DIALOG_DATA);
}
