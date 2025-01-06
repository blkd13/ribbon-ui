import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'fileSize'
})
export class FileSizePipe implements PipeTransform {

  transform(sizeInBytes?: number, decimals: number = 2): string {
    if (sizeInBytes === undefined) return '';
    if (sizeInBytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(sizeInBytes) / Math.log(k));

    return parseFloat((sizeInBytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

}
