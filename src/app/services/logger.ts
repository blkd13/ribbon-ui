import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'off';

@Injectable({ providedIn: 'root' })
export class LoggerService {
  private logLevel: LogLevel = environment.production ? 'warn' : 'debug';

  setLevel(level: LogLevel) {
    this.logLevel = level;
  }

  debug(message: any, ...optionalParams: any[]) {
    if (this.shouldLog('debug')) {
      console.debug(this.formatPrefix('DEBUG'), message, ...optionalParams, this.getCaller());
    }
  }

  info(message: any, ...optionalParams: any[]) {
    if (this.shouldLog('info')) {
      console.info(this.formatPrefix('INFO'), message, ...optionalParams);
    }
  }

  warn(message: any, ...optionalParams: any[]) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatPrefix('WARN'), message, ...optionalParams);
    }
  }

  error(message: any, ...optionalParams: any[]) {
    if (this.shouldLog('error')) {
      console.error(this.formatPrefix('ERROR'), message, ...optionalParams);
      // Optional: Send to external log server here
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentIndex = levels.indexOf(this.logLevel);
    const targetIndex = levels.indexOf(level);
    return currentIndex <= targetIndex;
  }

  private formatPrefix(level: string): string {
    const time = new Date().toISOString();
    return `[${level}] ${time}`;
  }

  private getCaller(): string {
    const stack = new Error().stack;
    if (!stack) return '';
    const lines = stack.split('\n');
    return lines[3]?.trim() || ''; // 呼び出し元の行
  }
}
