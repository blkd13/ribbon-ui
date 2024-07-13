import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'newlineToBr',
  standalone: true
})
export class NewlineToBrPipe implements PipeTransform {

  transform(value: string, ...args: unknown[]): string {
    return value.replace(/\n/g, '<br>');
  }
}
