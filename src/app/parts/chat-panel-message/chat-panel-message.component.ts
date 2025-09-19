import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { animate, style, transition, trigger } from '@angular/animations';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslateModule } from '@ngx-translate/core';
import { MarkdownComponent } from 'ngx-markdown';
import { ChatPanelBaseComponent } from '../chat-panel-base/chat-panel-base.component';
import { DocTagComponent } from '../doc-tag/doc-tag.component';
import { InlineSvgDirective } from "../inline-svg";

@Component({
    selector: 'app-chat-panel-message',
    imports: [
        CommonModule, FormsModule, DocTagComponent,
        MatTooltipModule, MarkdownComponent, MatIconModule, MatButtonModule, MatExpansionModule, MatSnackBarModule, MatProgressSpinnerModule, MatMenuModule,
        MatTabsModule, MatButtonToggleModule, TranslateModule,
    InlineSvgDirective
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
