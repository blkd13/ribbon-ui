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

import { CollectionViewer, SelectionChange, DataSource } from '@angular/cdk/collections';
import { FlatTreeControl } from '@angular/cdk/tree';
import { OnInit, Component, Injectable, inject } from '@angular/core';
import { BehaviorSubject, merge, Observable, Subject } from 'rxjs';
import { map, single, startWith, tap } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';

// フラットなノード構造の定義
export class DynamicFlatNode {
  constructor(
    public name: string,
    public type: string,
    public id: string,
    public level: number,
    public expandable: boolean,
    public isLoading = false
  ) { }
}
// 型定義
interface BoxEntry {
  type: 'folder' | 'file' | 'web_link';
  id: string;
  sequence_id: string;
  etag: string;
  name: string;
  file_version?: {
    type: string;
    id: string;
    sha1: string;
  };
  sha1?: string;
}

interface BoxResponse {
  total_count: number;
  entries: BoxEntry[];
  offset: number;
  limit: number;
  order: {
    by: string;
    direction: string;
  }[];
}


// データベースサービス
@Injectable({ providedIn: 'root' })
export class DynamicDatabase {
  apiBoxService: ApiBoxService = inject(ApiBoxService);

  // store: { [key: string]: DynamicFlatNode[] } = localStorage.getItem('box') ? JSON.parse(localStorage.getItem('box')!) : {};
  http: HttpClient = inject(HttpClient);

  // // 初期データの生成
  // getInitialData(jsonData: BoxResponse): DynamicFlatNode[] {
  //   return jsonData.entries.map(item => new DynamicFlatNode(
  //     item.name,
  //     item.type,
  //     item.id,
  //     0,
  //     item.type === 'folder'
  //   ));
  // }

  // 子ノードの取得（ダミーAPI）
  getChildren(nodeId: string): Observable<DynamicFlatNode[]> {
    // // 事前にキャッシュを取り出す
    // const cached = this.store[nodeId];

    // HTTPリクエストの Observable
    const request$ = this.apiBoxService.folder(nodeId)
      .pipe(
        map(response =>
          response.item_collection.entries.map(item =>
            new DynamicFlatNode(
              item.name,
              item.type,
              item.id,
              0,
              item.type === 'folder'
            )
          )
        ),
        tap(mapped => {
          // HTTPで取れたデータは store にキャッシュ
          // this.store[nodeId] = mapped;
          // localStorage.setItem('box', JSON.stringify(this.store));
        })
      );

    // if (cached) {
    //   // キャッシュがあれば「キャッシュを先に吐く → HTTPレスポンスを流す」の二発更新
    //   return request$.pipe(
    //     // 「ストリームの先頭にキャッシュを流す」(二発更新の 1 発目)
    //     startWith(cached)
    //   );
    // } else {
    //   // キャッシュが無ければ普通に HTTPレスポンスのみ流す
    //   return request$;
    // }

    return request$;
  }


  // ダウンロードメソッドを追加
  downloadFile(fileId: string, fileName: string): Observable<void> {
    return this.http.get(`/user/oauth/api/proxy/box/2.0/files/${fileId}/content`,
      { responseType: 'blob' }
    ).pipe(
      map(blob => {
        // blobからファイルを作成してダウンロード
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        window.URL.revokeObjectURL(url);
      })
    );
  }
}

// データソース
export class DynamicDataSource implements DataSource<DynamicFlatNode> {
  dataChange = new BehaviorSubject<DynamicFlatNode[]>([]);

  get data(): DynamicFlatNode[] {
    return this.dataChange.value;
  }
  set data(value: DynamicFlatNode[]) {
    this._treeControl.dataNodes = value;
    this.dataChange.next(value);
  }

  constructor(
    private _treeControl: FlatTreeControl<DynamicFlatNode>,
    private _database: DynamicDatabase,
  ) { }

  connect(collectionViewer: CollectionViewer): Observable<DynamicFlatNode[]> {
    this._treeControl.expansionModel.changed.subscribe(change => {
      if ((change as SelectionChange<DynamicFlatNode>).added ||
        (change as SelectionChange<DynamicFlatNode>).removed) {
        this.handleTreeControl(change as SelectionChange<DynamicFlatNode>);
      }
    });

    return merge(collectionViewer.viewChange, this.dataChange).pipe(map(() => this.data));
  }

  disconnect(collectionViewer: CollectionViewer): void { }

  handleTreeControl(change: SelectionChange<DynamicFlatNode>) {
    if (change.added) {
      change.added.forEach(node => this.toggleNode(node, true));
    }
    if (change.removed) {
      change.removed.slice().reverse().forEach(node => this.toggleNode(node, false));
    }
  }

  toggleNode(node: DynamicFlatNode, expand: boolean) {
    node.isLoading = true;
    this.dataChange.next(this.data);

    if (expand) {
      // this._database.getChildren(node.id).subscribe(children => {
      //   const index = this.data.indexOf(node);
      //   if (index < 0) return;

      //   // 子ノードのレベルを設定
      //   const nodes = children.map(child => {
      //     child.level = node.level + 1;
      //     return child;
      //   });

      //   // データの挿入
      //   this.data.splice(index + 1, 0, ...nodes);
      //   node.isLoading = false;
      //   this.dataChange.next(this.data);
      // });

      this._database.getChildren(node.id).subscribe(children => {
        const index = this.data.indexOf(node);
        if (index < 0) return;

        // いったん "node より下の階層" を全部消してから
        let count = 0;
        for (let i = index + 1; i < this.data.length && this.data[i].level > node.level; i++, count++) { }
        this.data.splice(index + 1, count);

        // 最新データを挿入
        children.forEach(child => child.level = node.level + 1);
        this.data.splice(index + 1, 0, ...children);

        node.isLoading = false;
        this.dataChange.next(this.data);
      });

    } else {
      const index = this.data.indexOf(node);
      let count = 0;
      for (let i = index + 1; i < this.data.length && this.data[i].level > node.level; i++, count++) { }
      this.data.splice(index + 1, count);
      node.isLoading = false;
      this.dataChange.next(this.data);
    }
  }
}

@Component({
  selector: 'app-box-tree',
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatTreeModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatProgressSpinnerModule,
    UserMarkComponent,
  ],
  templateUrl: './box-tree.component.html',
  styleUrl: './box-tree.component.scss'
})
export class BoxComponent implements OnInit {

  treeControl: FlatTreeControl<DynamicFlatNode>;
  dataSource: DynamicDataSource;

  database = inject(DynamicDatabase);

  constructor() {
    this.treeControl = new FlatTreeControl<DynamicFlatNode>(
      node => node.level,
      node => node.expandable
    );
    this.dataSource = new DynamicDataSource(this.treeControl, this.database);
  }

  hasChild = (_: number, node: DynamicFlatNode) => node.expandable;

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

  boxSearchResult!: BoxResponse;

  ngOnInit(): void {
    this.activatedRoute.params.subscribe(params => {
      const { type, id } = params as { type: string, id: string };
      this.load(id);
    });
    // this.http.get<any>(`/user/oauth/api/proxy/box/2.0/users/me`).subscribe({
    //   next: next => {
    //     console.log(next);
    //     this.onTop();
    //   }
    // });
  }

  onTop(): void {
    this.load();
  }

  load(itemId: string = '0'): void {
    this.database.getChildren(itemId).subscribe({
      // this.http.get<BoxResponse>(`/user/oauth/api/proxy/box/2.0/folders/0/items`).subscribe({
      next: next => {
        // this.boxSearchResult = next;
        console.log(next);

        // // 初期データの設定
        // this.dataSource.data = this.database.getInitialData(next);
        this.dataSource.data = next;
      }
    });
  }

  // ファイルクリックハンドラを追加
  onNodeClick(node: DynamicFlatNode): void {
    if (node.type === 'file') {
      this.database.downloadFile(node.id, node.name).subscribe({
        error: (error) => {
          console.error('Download failed:', error);
          // エラー時の処理（例：エラーメッセージの表示）
        }
      });
    }
  }

  searchKeyword = '';
  onSearch(): void {
    this.http.get<any>(`/user/oauth/api/proxy/box/2.0/search?query=${this.searchKeyword}&type=file`).subscribe({
      next: next => {
        this.boxSearchResult = next;
        console.log(next);

        // // 初期データの設定
        // this.dataSource.data = this.database.getInitialData(next);
        this.dataSource.data = next;
      },
      error: error => {
        console.error(error);
      },
    });
  }

  stopImmediatePropagation($event: Event): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }
}
