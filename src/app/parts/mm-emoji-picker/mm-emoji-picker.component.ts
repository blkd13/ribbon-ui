import { Component, inject, OnInit } from '@angular/core';
import { ApiMattermostService, MattermostEmoji } from '../../services/api-mattermost.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-mm-emoji-picker',
  imports: [CommonModule, FormsModule],
  templateUrl: './mm-emoji-picker.component.html',
  styleUrl: './mm-emoji-picker.component.scss'
})
export class MmEmojiPickerComponent implements OnInit {

  readonly apiMattermostService: ApiMattermostService = inject(ApiMattermostService);

  emojiList: MattermostEmoji[] = [];

  constructor() {

  }


  searchText = '';
  emojis: MattermostEmoji[] = [];
  filteredEmojis: MattermostEmoji[] = [];
  categories = [
    { id: 'custom', icon: '😀' },
    { id: 'flags', icon: '🏳️' },
    // その他カテゴリー
  ];

  ngOnInit() {
    // 絵文字データの初期化
    this.apiMattermostService.mattermostGetEmoji().subscribe({
      next: next => {
        this.emojis = next;
      },
      error: error => {

      }
    });
  }

  filterEmojis() {
    this.filteredEmojis = this.emojis.filter(emoji =>
      emoji.name.toLowerCase().includes(this.searchText.toLowerCase())
    );
  }

  selectCategory(category: any) {
    // カテゴリーによる絵文字のフィルタリング
  }

  selectEmoji(emoji: MattermostEmoji) {
    // 絵文字選択時の処理
    // this.emojiSelected.emit(emoji);
  }

  // @Output() emojiSelected = new EventEmitter<Emoji>();

}
