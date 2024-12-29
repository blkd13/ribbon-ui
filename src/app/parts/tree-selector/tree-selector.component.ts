import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
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
import { BehaviorSubject, merge, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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
  // box: BoxService = inject(BoxService);

  // 初期データの生成
  getInitialData(jsonData: BoxResponse): DynamicFlatNode[] {
    return jsonData.entries.map(item => new DynamicFlatNode(
      item.name,
      item.type,
      item.id,
      0,
      item.type === 'folder'
    ));
  }

  http: HttpClient = inject(HttpClient);

  // 子ノードの取得（ダミーAPI）
  getChildren(nodeId: string): Observable<DynamicFlatNode[]> {
    return this.http.get<BoxResponse>(`/user/oauth/api/proxy/box/2.0/folders/${nodeId}/items`)
      .pipe(
        map(response => response.entries.map(item =>
          new DynamicFlatNode(
            item.name,
            item.type,
            item.id,
            0,  // レベルは呼び出し側で適切に設定
            item.type === 'folder'
          )
        ))
      );
  }

  // ダウンロードメソッドを追加
  downloadFile(fileId: string, fileName: string): Observable<void> {
    return this.http.get(
      `/user/oauth/api/proxy/box/2.0/files/${fileId}/content`,
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
      this._database.getChildren(node.id).subscribe(children => {
        const index = this.data.indexOf(node);
        if (index < 0) return;

        // 子ノードのレベルを設定
        const nodes = children.map(child => {
          child.level = node.level + 1;
          return child;
        });

        // データの挿入
        this.data.splice(index + 1, 0, ...nodes);
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
    selector: 'app-tree-selector',
    imports: [
        CommonModule, FormsModule,
        MatTreeModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatProgressSpinnerModule,
        UserMarkComponent,
    ],
    templateUrl: './tree-selector.component.html',
    styleUrl: './tree-selector.component.scss'
})
export class TreeSelectorComponent implements OnInit {

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
    this.http.get<any>(`/user/oauth/api/proxy/box/2.0/users/me`).subscribe({
      next: next => {
        console.log(next);
        this.onTop();
      }
    });
  }

  onTop(): void {
    this.http.get<BoxResponse>(`/user/oauth/api/proxy/box/2.0/folders/0/items`).subscribe({
      next: next => {
        this.boxSearchResult = next;
        console.log(next);

        // 初期データの設定
        this.dataSource.data = this.database.getInitialData(next);
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

        // 初期データの設定
        this.dataSource.data = this.database.getInitialData(next);
      },
      error: error => {
        console.error(error);
      },
    });
  }
}
