import { ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { ChatPanelMessageComponent } from '../../parts/chat-panel-message/chat-panel-message.component';
import { ChatPanelSystemComponent } from '../../parts/chat-panel-system/chat-panel-system.component';
import { DocTagComponent } from '../../parts/doc-tag/doc-tag.component';
import { UserMarkComponent } from '../../parts/user-mark/user-mark.component';
import { ChatComponent } from './chat.component';

@Component({
  selector: 'app-chat-mobile',
  imports: [
    RouterModule,
    CommonModule, FormsModule, DocTagComponent,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTooltipModule,
    MatSliderModule, MatMenuModule, MatDialogModule, MatRadioModule, MatSelectModule,
    MatSnackBarModule, MatDividerModule, MatCheckboxModule, MatProgressSpinnerModule,
    MatBadgeModule, MatTabsModule, ScrollingModule, TranslateModule,
    MatSidenavModule,
    UserMarkComponent,
    ChatPanelMessageComponent, ChatPanelSystemComponent,
  ],
  templateUrl: './chat.mobile.component.html',
  styleUrl: './chat.mobile.component.scss',
  standalone: true,
})
export class ChatMobileComponent extends ChatComponent implements AfterViewInit, OnDestroy {
  private vvHandlers: Array<() => void> = [];

  ngAfterViewInit(): void {
    this.setupViewportSafety();
  }

  ngOnDestroy(): void {
    // Remove listeners
    this.vvHandlers.forEach(off => off());
    this.vvHandlers = [];
  }

  private setupViewportSafety(): void {
    const docEl = document.documentElement;

    const apply = (height: number, bottomInset: number) => {
      // viewport height (excluding keyboard) and keyboard offset
      docEl.style.setProperty('--vvh', `${height}px`);
      docEl.style.setProperty('--kb-offset', `${Math.max(0, bottomInset)}px`);
    };

    const vv: any = (window as any).visualViewport;
    const update = () => {
      try {
        if (vv) {
          const bottomInset = (window.innerHeight - vv.height - (vv.offsetTop || 0));
          apply(vv.height, bottomInset);
        } else {
          // Fallback: use innerHeight; keyboard offset unknown
          apply(window.innerHeight, 0);
        }
      } catch {
        apply(window.innerHeight, 0);
      }
    };

    update();

    if (vv) {
      const onResize = () => update();
      const onScroll = () => update();
      vv.addEventListener('resize', onResize);
      vv.addEventListener('scroll', onScroll);
      this.vvHandlers.push(() => vv.removeEventListener('resize', onResize));
      this.vvHandlers.push(() => vv.removeEventListener('scroll', onScroll));
    } else {
      const onResize = () => update();
      window.addEventListener('resize', onResize);
      this.vvHandlers.push(() => window.removeEventListener('resize', onResize));
    }

    const onOrientation = () => setTimeout(update, 250);
    window.addEventListener('orientationchange', onOrientation);
    this.vvHandlers.push(() => window.removeEventListener('orientationchange', onOrientation));

    // Ensure focused textarea is visible after keyboard opens
    const onFocusIn = () => {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
          active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 100);
    };
    document.addEventListener('focusin', onFocusIn);
    this.vvHandlers.push(() => document.removeEventListener('focusin', onFocusIn));
  }
}
