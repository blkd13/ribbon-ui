import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { MarkdownComponent } from 'ngx-markdown';
import { DocTagComponent } from '../doc-tag/doc-tag.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { animate, style, transition, trigger } from '@angular/animations';
import { ChatPanelBaseComponent } from '../chat-panel-base/chat-panel-base.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

@Component({
    selector: 'app-chat-panel-message',
    imports: [
        CommonModule, FormsModule, DocTagComponent,
        MatTooltipModule, MarkdownComponent, MatIconModule, MatButtonModule, MatExpansionModule, MatSnackBarModule, MatProgressSpinnerModule, MatMenuModule,
        MatTabsModule, MatButtonToggleModule,
    ],
    templateUrl: './chat-panel-message.component.html',
    styleUrls: ['../chat-panel-base/chat-panel-base.component.scss', './chat-panel-message.component.scss',],
    // encapsulation: ViewEncapsulation.None,
    animations: [
        trigger('fadeAnimation', [
            transition(':enter', [
                style({ opacity: 0 }),
                animate('200ms', style({ opacity: 1 }))
            ]),
            transition(':leave', [
                animate('200ms', style({ opacity: 0 }))
            ])
        ])
    ]
})
export class ChatPanelMessageComponent extends ChatPanelBaseComponent {
}
