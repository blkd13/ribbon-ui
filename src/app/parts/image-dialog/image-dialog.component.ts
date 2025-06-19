import { Component } from '@angular/core';
import { BaseDialogComponent } from '../../shared/base/base-dialog.component';

export interface ImageDialogData {
  fileName: string;
  imageBase64String: string;
}

@Component({
    selector: 'app-image-dialog',
    imports: [],
    templateUrl: './image-dialog.component.html',
    styleUrl: './image-dialog.component.scss'
})
export class ImageDialogComponent extends BaseDialogComponent<ImageDialogData> {
  // BaseDialogComponentから継承されるため、dialogRefとdataは自動的に利用可能
}
