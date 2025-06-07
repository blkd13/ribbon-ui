import { Pipe, PipeTransform } from '@angular/core';

// shared/pipes/group-by.pipe.ts
@Pipe({
  name: 'groupBy',
  pure: true, // パフォーマンス重要
})
export class GroupByPipe implements PipeTransform {
  transform<T>(
    array: T[],
    key: keyof T
  ): Array<{ key: string, values: T[] }> {
    if (!array?.length) return [];

    const grouped = array.reduce((groups, item) => {
      const groupKey = String(item[key]);
      (groups[groupKey] ||= []).push(item);
      return groups;
    }, {} as Record<string, T[]>);

    return Object.entries(grouped).map(([key, values]) => ({
      key,
      values
    }));
  }
}