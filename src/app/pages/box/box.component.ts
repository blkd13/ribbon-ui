import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTreeModule } from '@angular/material/tree';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../services/auth.service';
import { GService } from '../../services/g.service';
import { ApiBoxService } from '../../services/api-box.service';

import { UserMarkComponent } from "../../parts/user-mark/user-mark.component";

import { OnInit, Component, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BoxApiCollection, BoxApiCollectionList, BoxApiFolder, BoxApiSearchResults } from './box-interface';
import { Observable, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MatMenu, MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-box',
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatTreeModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatProgressSpinnerModule,
    MatMenuModule, MatFormFieldModule, MatInputModule, MatExpansionModule, MatAutocompleteModule,
    MatTabsModule,
    UserMarkComponent,
  ],
  templateUrl: './box.component.html',
  styleUrl: './box.component.scss'
})
export class BoxComponent implements OnInit {

  readonly authService: AuthService = inject(AuthService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly router: Router = inject(Router);
  readonly activatedRoute: ActivatedRoute = inject(ActivatedRoute);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly g: GService = inject(GService);
  // readonly apiGitlabService: ApiGitlabService = inject(ApiGitlabService);
  // readonly apiMattermostService: ApiMattermostService = inject(ApiMattermostService);
  // readonly mattermostTimelineService: MattermostTimelineService = inject(MattermostTimelineService);
  readonly apiBoxService: ApiBoxService = inject(ApiBoxService);
  readonly http: HttpClient = inject(HttpClient);
  // readonly apiGiteaService: ApiGiteaService = inject(ApiGiteaService);

  item?: BoxApiFolder;
  boxOriginUri = environment.boxOriginUri;

  collectionList?: BoxApiCollectionList;

  tabList: { id: string, name: string }[] = [];

  constructor() {
    this.apiBoxService.getCollection().subscribe({
      next: (response) => {
        // console.log('コレクション取得成功:', response);
        this.collectionList = response;
      },
      error: (error) => {
        console.error('コレクション取得失敗:', error);
        this.snackBar.open('コレクション取得に失敗しました', '閉じる', { duration: 3000 });
      },
    });
  }

  ngOnInit(): void {
    this.activatedRoute.params.subscribe(params => {
      const { type, id } = params as { type: string, id: string };
      this.load(id);
    });
  }

  addTabId: string = '';
  move($event: MouseEvent, itemId: string): void {
    if ($event.ctrlKey || $event.shiftKey || $event.altKey) {
      // メタキーが押されている場合はブラウザのデフォルト動作を行う
    } else {
      this.router.navigate(['/box', 'folder', itemId]);
      this.stopImmediatePropagation($event);
    }
    // タブ機能は難しい上にブラウザでやった方がいい気もしてきたので一旦やめた
    // if ($event.ctrlKey) {
    //   if (this.item) {
    //     if (this.tabList.map(tab => tab.id).includes(this.item.id)) {
    //     } else {
    //       this.tabList.push(this.item);
    //     }
    //   } else { }
    //   this.addTabId = itemId;
    //   this.load(itemId);
    //   if ($event.shiftKey) {
    //     // 継続⇒新規タブに遷移
    //   } else {
    //     return;
    //   }
    // } else { }
  }
  deleteTab(index: number): void {
    this.tabList.splice(index, 1);
  }

  currentSubscription: Subscription | null = null;
  load(itemId: string = '0'): void {
    if (this.currentSubscription) {
      // 既存のサブスクリプションを破棄しないと追い越しが発生してしまうので
      this.currentSubscription.unsubscribe();
    } else { }
    this.currentSubscription = this.apiBoxService.folder(itemId).subscribe({
      next: next => {
        // console.log(next);
        this.item = next;
        // // tabListに追加
        // if (this.tabList.map(tab => tab.id).includes(itemId)) {
        // } else if (this.addTabId === itemId) {
        //   this.tabList.push(next);
        // }
      },
      error: error => {
        console.error(error);
      },
    });
  }

  onOpenCollection(collection: BoxApiCollection): void {
    this.apiBoxService.boxCollectionItem(collection.id).subscribe({
      next: (response) => {
        // console.log('コレクション取得成功:', response);
        collection.items = response;
      },
      error: (error) => {
        console.error('コレクション取得失敗:', error);
        this.snackBar.open('コレクション取得に失敗しました', '閉じる', { duration: 3000 });
      },
    });
  }

  historyView(): void {
    this.apiBoxService.boxEvents().subscribe({  // ファイルの更新履歴を取得
      next: next => {
        // console.log(next);
        next.entries.map(entry => {
          // console.log(entry);
        });
      },
      error: error => {
        console.error(error);
      },
    });
  }

  // ファイルクリックハンドラを追加
  onNodeClick(itemId: string): void {
    this.router.navigate(['/box', 'folder', itemId]);
  }

  boxSearchResult?: BoxApiSearchResults;
  searchKeyword = '';
  onSearch($event: Event): void {
    this.apiBoxService.boxSearch(this.searchKeyword).subscribe({
      next: next => {
        // console.log(next);
        this.boxSearchResult = next;
      },
      error: error => {
        console.error(error);
      },
    });
  }

  checkCollectionIdSubscription: Subscription | null = null;
  enableCollectionId: boolean = false;
  checkCollectionId($event: Event): void {
    // console.log(this.collectionId);
    this.enableCollectionId = false;
    if (this.collectionId && Number(this.collectionId) > 0) {
      if (this.checkCollectionIdSubscription) {
        this.checkCollectionIdSubscription?.unsubscribe();
      } else { }
      this.checkCollectionIdSubscription = this.apiBoxService.boxCollection(this.collectionId).subscribe({
        next: (response) => {
          // console.log('コレクション取得成功:', response);
          this.enableCollectionId = true;
        },
        error: (error) => {
          console.error('コレクション取得失敗:', error);
          this.snackBar.open('コレクション取得に失敗しました', '閉じる', { duration: 3000 });
        },
      });
    } else {
      this.snackBar.open('コレクションIDを入力してください', '閉じる', { duration: 3000 });
    }
  }

  registCollectionId(collectionId: string): void {
    // this.snackBar.open('コレクションが取得されました', '閉じる', { duration: 3000 });
    // 必要に応じて、取得後の処理（例：リストの更新）を追加
    this.apiBoxService.registCollectionId(this.collectionId).subscribe({
      next: (response) => {
        // console.log('コレクション登録成功:', response);
        this.snackBar.open('コレクションが登録されました', '閉じる', { duration: 3000 });
        // 必要に応じて、登録後の処理（例：リストの更新）を追加
        this.collectionId = ''; // 入力フォームをクリア
      },
      error: (error) => {
        console.error('コレクション登録失敗:', error);
        this.snackBar.open('コレクション登録に失敗しました', '閉じる', { duration: 3000 });
      },
    });
  }

  collectionId: string = '';
  registCollection(): void {
    if (!this.collectionId) {
      this.snackBar.open('コレクションIDを入力してください', '閉じる', { duration: 3000 });
      return;
    }

    this.apiBoxService.registCollectionId(this.collectionId).subscribe({
      next: (response) => {
        // console.log('コレクション登録成功:', response);
        this.snackBar.open('コレクションが登録されました', '閉じる', { duration: 3000 });
        // 必要に応じて、登録後の処理（例：リストの更新）を追加
        this.collectionId = ''; // 入力フォームをクリア
      },
      error: (error) => {
        console.error('コレクション登録失敗:', error);
        this.snackBar.open('コレクション登録に失敗しました', '閉じる', { duration: 3000 });
      },
    });
  }

  sort(type: 'name' | 'timestamp' | 'size'): void {
    if (this.item) {
      this.item.item_collection.entries.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        if (type === 'name' || a.modified_at === undefined || b.modified_at === undefined || a.size === undefined || b.size === undefined) {
          return aName.localeCompare(bName);
        } else if (type === 'timestamp') {
          return a.modified_at.localeCompare(b.modified_at);
        } else if (type === 'size') {
          return a.size - b.size;
        } else {
          return 0;
        }
      });
    }
  }

  stopImmediatePropagation($event: Event): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }
}
