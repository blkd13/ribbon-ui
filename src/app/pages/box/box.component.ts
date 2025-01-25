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

import { OnInit, Component, inject, viewChild, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BoxApiCollection, BoxApiCollectionList, BoxApiEntry, BoxApiFolder, BoxApiItemEntry, BoxApiSearchResults, BoxMkdirErrorResponse, BoxUploadErrorResponse } from './box-interface';
import { concatMap, Observable, Subscription, tap, switchMap, from, toArray, catchError, throwError, of, concat } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MatMenu, MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTabsModule } from '@angular/material/tabs';
import { FileSizePipe } from '../../pipe/file-size.pipe';
import { MatRadioModule } from '@angular/material/radio';
import { FullPathFile } from '../../services/file-manager.service';
import { FileDropDirective } from '../../parts/file-drop.directive';
import { getFileIcon, getFolderIcon } from '../../ext/vscode-material-icon-theme/core';
import { DialogComponent } from '../../parts/dialog/dialog.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AppMenuComponent } from '../../parts/app-menu/app-menu.component';

@Component({
  selector: 'app-box',
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatTreeModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatProgressSpinnerModule,
    MatMenuModule, MatFormFieldModule, MatInputModule, MatExpansionModule, MatAutocompleteModule,
    MatTabsModule, MatRadioModule, MatProgressSpinnerModule, MatTooltipModule,
    FileSizePipe, FileDropDirective,
    UserMarkComponent, AppMenuComponent,
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

  isLoading = false;
  isFine = true;

  dateFormat = 'yyyy 年 MM 月 dd 日 hh 時 mm 分 ss 秒'; // SSS はどうせ000なので表示しないことにした
  thumbnailStatusMas: { [extension: string]: undefined | 'fine' | 'error' } = {};

  constructor() {
    this.refreshCollection();
  }

  getVSCodeFileIcon = getFileIcon;
  getVSCodeFolderIcon = getFolderIcon;

  refreshCollection(): void {
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

  boxUrl = '';
  boxUrlMove(): void {
    const url = new URL(this.boxUrl);
    const paths = url.pathname.split('/');
    if (paths[1] === 'folder') {
      this.router.navigate(['/box', 'folder', paths[2]]);
    } else {

    }
    // this.boxUrl = '';
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
    this.isLoading = true;
    if (this.currentSubscription) {
      // 既存のサブスクリプションを破棄しないと追い越しが発生してしまうので
      this.currentSubscription.unsubscribe();
    } else { }
    let isFine = false;
    let resCounter = 0;
    this.offset = 0;
    this.currentSubscription = this.apiBoxService.folder(itemId).pipe(
      tap(next => {
        // console.log(`BOX-RES=${resCounter}`);
        // resCounter++;
        // console.log(next);
        this.item = next;
        this.setTitle();
        this.sort();
        this.isLoading = false;
        // // tabListに追加
        // if (this.tabList.map(tab => tab.id).includes(itemId)) {
        // } else if (this.addTabId === itemId) {
        //   this.tabList.push(next);
        // }
        isFine = true;
      }),
      catchError(error => {
        isFine = false;
        return of();
      }), // エラーは面倒なので握りつぶす。
    ).subscribe({
      complete: () => {
        this.isLoading = false;
        this.isFine = isFine;
        if (!isFine) {
          this.item = undefined;
        } else { }

        if (this.item) {
          // // 配下のフォルダをプリロード
          // this.currentSubscription = concat(
          //   ...[
          //     ...this.item.item_collection.entries.filter(entry => entry.type === 'folder'), // サービス内でキャッシュ持ってればスキップされるので思い切って全打ちする
          //     ...this.item.path_collection.entries.filter(entry => entry.type === 'folder'), // サービス内でキャッシュ持ってればスキップされるので思い切って全打ちする
          //   ].map(entry => this.apiBoxService.preLoadFolder(entry.id))
          // ).subscribe({
          //   next: next => {
          //     // console.log(next.id);
          //   }
          // });
        } else { }
      }
    });
  }

  onOpenCollection(collection: BoxApiCollection): void {
    this.apiBoxService.collectionItem(collection.id).subscribe({
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
  searchObserver: Subscription | null = null;
  isSearching: boolean = false;
  onSearch($event: Event): void {
    this.isSearching = true;
    if (this.searchObserver) {
      // 投げてある場合はキャンセルする
      this.searchObserver.unsubscribe();
    } else { }
    this.searchObserver = this.apiBoxService.boxSearch(($event as InputEvent).data || '').subscribe({
      next: next => {
        // console.log(next);
        this.boxSearchResult = next;
        this.isSearching = false;
      },
      error: error => {
        console.error(error);
        this.isSearching = false;
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
        this.refreshCollection();
      },
      error: (error) => {
        console.error('コレクション登録失敗:', error);
        this.snackBar.open('コレクション登録に失敗しました', '閉じる', { duration: 3000 });
      },
    });
  }

  title: string = 'Box';
  setTitle(): void {
    document.title = `Box : ${this.item?.name || ''}`;
  }
  sortType: 'name' | 'timestamp' | 'size' = 'name';
  sortAscDesc: 'asc' | 'desc' = 'asc';
  sort(): void {
    const type = this.sortType;
    const ascDescFlag = this.sortAscDesc === 'asc' ? 1 : -1;

    if (this.item) {
      this.item.item_collection.entries = this.item.item_collection.entries.sort((a, b) => {
        const aIsFolder = a.type === 'folder';
        const bIsFolder = b.type === 'folder';

        // asc/descによらずフォルダを優先
        if (aIsFolder && !bIsFolder) {
          return -1; // aがフォルダでbがファイルならaを前に
        }
        if (!aIsFolder && bIsFolder) {
          return 1;  // aがファイルでbがフォルダならbを前に
        }

        // フォルダ同士、ファイル同士でソート
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        if (type === 'name' || a.modified_at === undefined || b.modified_at === undefined || a.size === undefined || b.size === undefined) {
          return ascDescFlag * aName.localeCompare(bName);
        } else if (type === 'timestamp') {
          return ascDescFlag * a.modified_at.localeCompare(b.modified_at);
        } else if (type === 'size') {
          return ascDescFlag * (a.size - b.size);
        } else {
          return 0;
        }
      });
      // if (ascDesc === 'desc') {
      //   this.item.item_collection.entries = this.item.item_collection.entries.reverse();
      // } else { }
    }
  }

  remove(entry: BoxApiItemEntry): void {
    this.dialog.open(DialogComponent, { data: { title: 'Confirm', message: `本当に削除しますか？`, options: ['Cancel', 'OK'] } }).afterClosed().subscribe({
      next: next => {
        if (next === 1) {
          this.apiBoxService.boxRemoveItem(entry).subscribe({
            next: next => {
              this.snackBar.open('削除しました。', '閉じる', { duration: 3000 });
              if (this.item) {
                const targetIndex = this.item.item_collection.entries.findIndex(e0 => e0.id === entry.id);
                if (targetIndex >= 0) {
                  this.item.item_collection.entries.splice(targetIndex, 1);
                } else { }
              } else { /** ここには来ない */ }
            },
            error: error => {
              this.snackBar.open('削除に失敗しました。', '閉じる', { duration: 3000 });
            },
          });
        } else {/** キャンセル */ }
      }
    });
  }

  selectedFiles: FullPathFile[] = [];
  // ファイル選択
  onFilesDropped(files: FullPathFile[]) {
    this.selectedFiles = files;
    if (this.item) {
      this.apiBoxService.uploadFiles(this.item.id, files).subscribe({
        next: response => {
          response.entries.map(entry => {
            console.log(entry);
          });
          console.log('アップロード成功:', response);
          this.snackBar.open('アップロード成功', '閉じる', { duration: 3000 });
          if (this.item) {
            this.load(this.item.id);
          }
        },
        error: error => {
          console.error('アップロードエラー:', error);
          this.snackBar.open('アップロードエラー', '閉じる', { duration: 3000 });
        }
      });
    } else {
    }
  }

  stopImmediatePropagation($event: Event): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }


  // 無限スクロールの実装
  offset: number = 0;
  loading: boolean = false;
  @HostListener('window:scroll', ['$event'])
  onScroll(event: Event): void {
    if (this.loading || !this.item || !this.item.item_collection) {
      return;
    }
    const element = event.target as HTMLElement;
    if (element) {
      // スクロール位置が一番下に近いかどうかを判定
      const isBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 200;
      if (isBottom) {
        this.loadMore();
      }
    }
  }
  loadMore(): void {
    if (!this.item || !this.item.item_collection) {
      return;
    }
    // 未実装
    // this.loading = true;
    // this.offset += 100;
    // const offset = this.offset;
    // this.apiBoxService.folder(this.item.id, this.offset).subscribe({
    //   next: (response) => {
    //     if (this.item && response.item_collection) {
    //       this.item.item_collection.entries = [...this.item.item_collection.entries, ...response.item_collection.entries];
    //       this.loading = false;
    //     }
    //   },
    //   error: (error) => {
    //     console.error('追加データの取得に失敗しました:', error);
    //     this.snackBar.open('追加データの取得に失敗しました', '閉じる', { duration: 3000 });
    //     this.loading = false;
    //   },
    // });
  }
}
