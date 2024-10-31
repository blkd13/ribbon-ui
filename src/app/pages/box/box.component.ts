import { OnInit, ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTreeModule } from '@angular/material/tree';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';


import { CollectionViewer, SelectionChange, DataSource } from '@angular/cdk/collections';
import { FlatTreeControl } from '@angular/cdk/tree';
import { BehaviorSubject, merge, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthService } from '../../services/auth.service';
import { GService } from '../../services/g.service';
import { ApiBoxService } from '../../services/api-box.service';

import { UserMarkComponent } from "../../parts/user-mark/user-mark.component";

interface BoxNode {
  etag: string;
  id: string;
  name: string;
  sequence_id: string;
  type: string;
  file_version?: {
    id: string,
    sha1: string,
    type: string,
  };
  sha1?: string;
}

@Component({
  selector: 'app-box',
  standalone: true,
  imports: [
    CommonModule,
    MatTreeModule, MatButtonModule, MatIconModule, MatProgressBarModule,
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

  boxSearchResult: { entries: BoxNode[] } = { entries: [] };

  ngOnInit(): void {
    this.http.get<any>(`/user/oauth/api/proxy/box/2.0/users/me`).subscribe({
      next: next => {
        console.log(next);
        this.http.get<{ entries: BoxNode[] }>(`/user/oauth/api/proxy/box/2.0/folders/0/items`).subscribe({
          next: next => {
            this.boxSearchResult = next;
            console.log(next);
            // this.http.get<any>(`/user/oauth/api/proxy/box/2.0/search?query=sales`).subscribe({
            //   next: next => {
            //     this.boxSearchResult = next;
            //     console.log(next);
            //   }
            // });
          }
        });
      }
    });
  }
  constructor() {
    const database = inject(DynamicDatabase);

    this.treeControl = new FlatTreeControl<DynamicFlatNode>(this.getLevel, this.isExpandable);
    this.dataSource = new DynamicDataSource(this.treeControl, database);

    this.dataSource.data = database.initialData();
  }
  treeControl: FlatTreeControl<DynamicFlatNode>;
  dataSource: DynamicDataSource;
  getLevel = (node: DynamicFlatNode) => node.level;
  isExpandable = (node: DynamicFlatNode) => node.expandable;
  hasChild = (_: number, _nodeData: DynamicFlatNode) => _nodeData.expandable;
}


interface FileNode {
  name: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

const sampleFileSystem: FileNode = {
  name: 'C:',
  type: 'directory',
  children: [
    {
      name: 'Users',
      type: 'directory',
      children: [
        {
          name: 'JohnDoe',
          type: 'directory',
          children: [
            { name: 'document.txt', type: 'file' },
            { name: 'image.jpg', type: 'file' },
          ],
        },
      ],
    },
    {
      name: 'Program Files',
      type: 'directory',
    },
  ],
};


@Injectable({ providedIn: 'root' })
export class DynamicDatabase {
  dataMap = new Map<string, FileNode>();

  constructor() {
    this.buildDataMap(sampleFileSystem, '');
  }

  rootLevelNodes: string[] = ['C'];

  /** Initial data from database */
  initialData(): DynamicFlatNode[] {
    return this.rootLevelNodes.map(name => new DynamicFlatNode(name, 0, true));
  }

  buildDataMap(node: FileNode, path: string) {
    const fullPath = path ? `${path}/${node.name}` : node.name;
    this.dataMap.set(fullPath, node);
    if (node.children) {
      node.children.forEach(child => this.buildDataMap(child, fullPath));
    }
  }

  getChildren(node: string): FileNode[] | undefined {
    console.log(node);
    const fileNode = this.dataMap.get(node);
    return fileNode?.children;
  }

  isExpandable(node: string): boolean {
    const fileNode = this.dataMap.get(node);
    return fileNode?.type === 'directory';
  }
}

export class DynamicFlatNode {
  constructor(
    public item: string, // full path of the file/directory
    public level = 1,
    public expandable = false,
    public isLoading = signal(false),
    public type: 'file' | 'directory' = 'file' // Add type property
  ) { }
}

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
      if (
        (change as SelectionChange<DynamicFlatNode>).added ||
        (change as SelectionChange<DynamicFlatNode>).removed
      ) {
        this.handleTreeControl(change as SelectionChange<DynamicFlatNode>);
      }
    });

    return merge(collectionViewer.viewChange, this.dataChange).pipe(map(() => this.data));
  }

  disconnect(collectionViewer: CollectionViewer): void { }

  /** Handle expand/collapse behaviors */
  handleTreeControl(change: SelectionChange<DynamicFlatNode>) {
    if (change.added) {
      change.added.forEach(node => this.toggleNode(node, true));
    }
    if (change.removed) {
      change.removed
        .slice()
        .reverse()
        .forEach(node => this.toggleNode(node, false));
    }
  }

  /**
   * Toggle the node, remove from display list
   */
  toggleNode(node: DynamicFlatNode, expand: boolean) {
    const children = this._database.getChildren(node.item);
    const index = this.data.indexOf(node);
    if (!children || index < 0) {
      return;
    }

    node.isLoading.set(true);

    setTimeout(() => {
      if (expand) {
        const nodes = children.map(
          child => new DynamicFlatNode(
            `${node.item}/${child.name}`, // construct full path
            node.level + 1,
            this._database.isExpandable(`${node.item}/${child.name}`),
            signal(false),
            child.type // set the type
          ),
        );
        this.data.splice(index + 1, 0, ...nodes);
      } else {
        // ... existing code ...
      }

      this.dataChange.next(this.data);
      node.isLoading.set(false);
    }, 1000);
  }
}

