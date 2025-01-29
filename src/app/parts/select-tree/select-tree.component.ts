import { CommonModule } from '@angular/common';
import { Component, inject, input, OnInit, output } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { FileEntity, FileEntityForView, FileGroupEntity, FileGroupEntityForView, FileManagerService } from '../../services/file-manager.service';
import { GService } from '../../services/g.service';

interface OrgStruct {
  pare: OrgNode | undefined;
  depth: number;
  isActive: boolean;
  disabled: boolean;
  type: 'file' | 'folder' | 'mime';
  path: string;
  name: string;
}

interface OrgNode extends OrgStruct {
  type: 'folder' | 'mime';
  children: OrgStruct[];
  indeterminate: boolean;
}

interface FileInfo extends OrgStruct {
  type: 'file';
  id: string;
  projectId: string;
  fileBodyId: string;

  fileSize: number;
  fileType: string;
  metaJson: any;
  // lastModified: Date;
  children?: never;
  ext?: string;
}

interface TreeNode extends OrgNode {
  type: 'folder';
  children: (TreeNode | FileInfo)[];
  expanded: boolean;
}

interface MimeTreeNode extends OrgNode {
  type: 'mime';
  expanded: boolean;
  children: (MimeTreeNode)[];
}

function buildFileTreeFromFileInfo(files: FileInfo[]): { root: TreeNode[], folderList: TreeNode[] } {
  const folderList: TreeNode[] = [];
  const root: TreeNode[] = [];

  files.forEach(file => {
    const parts = file.path.split('/').filter(p => p);
    let currentLevel: (TreeNode | FileInfo)[] | undefined = root;
    let pare: TreeNode | undefined = undefined;

    parts.forEach((part, index) => {
      if (currentLevel) { } else { return; }
      const existingNode = currentLevel.find(node => node.name === part);
      if (existingNode && existingNode.type === 'folder') {
        currentLevel = existingNode.children;
        pare = existingNode;
      } else {
        let newNode: TreeNode | FileInfo;
        if (index === parts.length - 1) {
          // 既存ファイル
          newNode = file;
          // ノードとしての情報を追加
          newNode.depth = index;
          newNode.pare = pare;
        } else {
          newNode = {
            depth: index,
            pare: pare,
            isActive: true,
            disabled: false,
            indeterminate: false,
            path: parts.slice(0, index + 1).join('/'),
            name: part,
            type: 'folder',
            children: [],
            expanded: false,
          } as TreeNode;
          folderList.push(newNode);
          pare = newNode;
        }
        currentLevel.push(newNode);
        currentLevel = newNode.children;
      }
    });
  });

  // 直線的な中間フォルダを統合
  function simplifyTree(depth: number, node: TreeNode | FileInfo): void {
    node.depth = depth;
    switch (node.type) {
      case 'folder':
        if (node.children.length > 1) {
          node.children.forEach(child => simplifyTree(depth + 1, child));
        } else {
          const child = node.children[0];
          if (child.type === 'folder') {
            node.name += '/' + child.name;
            node.children = child.children;
            folderList.splice(folderList.indexOf(child), 1); // 削る
            simplifyTree(depth, node);
          } else {
            child.depth = depth + 1;
          }
        }
        break;
      default: // 'file' or 'mime'
        break;
    }
  }
  root.forEach(node => simplifyTree(0, node));

  // 名前の順にソート
  function sortTree(node: TreeNode | FileInfo): void {
    if (node.type === 'folder') {
      node.children.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        } else {
          return a.type === 'folder' ? -1 : 1;
        }
      });
      node.children.forEach(child => sortTree(child));
    }
  }
  root.forEach(node => sortTree(node));
  return { root, folderList };
}

function buildMimeTree(_files: FileInfo[]): MimeTreeNode[] {
  const extList: MimeTreeNode[] = [];
  const extMap = {} as { [ext: string]: MimeTreeNode };
  const extMimeMap = {} as { [ext: string]: { [fileType: string]: MimeTreeNode } };

  // パターンを抽出する関数
  function extractPattern(filename: string): string {
    // .から始まるものは拡張子ではないので削除
    const trimedName = filename.replaceAll(/^\.*/g, '');
    const parts = trimedName.split('.');

    if (parts.length >= 2) {
      // 特殊パターンの検出（例: .spec.ts, .component.ts など）
      const lastTwo = parts.slice(-2).join('.');
      // 既知の特殊パターンのリスト
      const specialPatterns = ['.spec.ts'];
      if (specialPatterns.includes(`.${lastTwo}`)) {
        return lastTwo;
      }
    }

    // 通常の拡張子
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  _files.forEach(file => {
    const ext = extractPattern(file.name);
    file.ext = ext;

    if (!extMap[ext]) {
      extMap[ext] = {
        depth: 0,
        pare: undefined,
        isActive: true,
        disabled: false,
        indeterminate: false,
        path: ext,
        name: ext,
        type: 'mime',
        expanded: true,
        children: [],
      };
      extList.push(extMap[ext]);
    }

    if (!extMimeMap[ext]) {
      extMimeMap[ext] = {};
    }
    if (!extMimeMap[ext][file.fileType]) {
      extMimeMap[ext][file.fileType] = {
        depth: 1,
        pare: extMap[ext],
        isActive: true,
        disabled: false,
        indeterminate: false,
        path: `${ext}/${file.fileType}`,
        name: file.fileType,
        type: 'mime',
        expanded: true,
        children: [],
      };
      extMap[ext].children.push(extMimeMap[ext][file.fileType]);
    }
    extMimeMap[ext][file.fileType].children.push(file as any);
  });

  // ソートと後処理は同じ
  extList.sort((a, b) => a.name.localeCompare(b.name));
  extList.forEach(extNode => {
    const mimes = Object.values(extMimeMap[extNode.name]);
    mimes.sort((a, b) => a.name.localeCompare(b.name));
    extNode.children = mimes;
  });

  if (extList[0]?.name === '') {
    const noExt = extList.shift();
    extList.push(noExt as any);
  }

  return extList;
}

@Component({
  selector: 'app-select-tree',
  imports: [CommonModule, MatCheckboxModule, MatIconModule],
  templateUrl: './select-tree.component.html',
  styleUrls: ['./select-tree.component.scss']
})
export class SelectTreeComponent implements OnInit {
  fileTree: TreeNode[] = [];
  extTree: MimeTreeNode[] = [];
  selectedMimes: Set<string> = new Set();

  initFile(): { fileBodyId: string, projectId: string, id: string, isActive: boolean, disabled: boolean, depth: number, pare: OrgNode | undefined, type: 'file', lastModified: Date, metaJson: any } {
    return { fileBodyId: '', projectId: '', id: '', isActive: true, disabled: false, depth: -1, pare: undefined as any, type: 'file', lastModified: new Date(), metaJson: {} };
  }

  folderList: TreeNode[] = [];
  fileInfos: FileInfo[] = [
    { ...this.initFile(), fileSize: 2048, path: '/home/user/documents/reports/document1.pdf', name: 'document1.pdf', fileType: 'application/pdf' },
    { ...this.initFile(), fileSize: 1024, path: '/home/user/images/image1.png', name: 'image1.png', fileType: 'image/png' },
    { ...this.initFile(), fileSize: 1024, path: '/home/etc/memo', name: 'memo', fileType: 'text/plain' },
    { ...this.initFile(), fileSize: 1024, path: '/home/etc/dat', name: 'dat', fileType: 'application/json' },
    { ...this.initFile(), fileSize: 1024, path: '/home/user/image1.png', name: 'image1.png', fileType: 'image/png' },
    { ...this.initFile(), fileSize: 1024, path: '/home/user/image1.png', name: 'image1.png', fileType: 'image/png' },
    { ...this.initFile(), fileSize: 5120, path: '/var/www/assets/images/image2.jpg', name: 'image2.jpg', fileType: 'image/jpeg' },
    { ...this.initFile(), fileSize: 1024, path: '/home/user/backups/system/backup1.tar.gz', name: 'backup1.tar.gz', fileType: 'application/gzip' },
  ];

  readonly fileGroup = input.required<FileGroupEntityForView>();
  readonly selectedFile = input<FileEntityForView>();
  readonly g: GService = inject(GService);

  readonly selectFile$ = output<FileEntityForView>();
  selectFile(file: OrgNode): void {
    this.selectFile$.emit(file as any as FileEntityForView);
  }
  // readonly messageGroup = input.required<MessageGroupForView>();
  // readonly index = input<number>();
  // // チャット入力欄
  // readonly textAreaElem = viewChild<ElementRef<HTMLTextAreaElement>>('textAreaElem');
  // readonly textBodyElem = viewChild<ElementRef<HTMLDivElement>>('textBodyElem');
  // readonly placeholder = input<string>();
  // readonly exPanel = viewChild.required<MatExpansionPanel>('exPanel');
  // readonly layout = input.required<'flex' | 'grid'>();
  invalidDirNames = [
    '.git',
    '.svn',
    'node_modules',
    // 'bower_components',
    // 'dist',
    // 'build',
    // 'target',
  ];
  ngOnInit(): void {
    this.fileInfos = [];

    this.fileGroup().files.filter((file, index) => {
      // (file as any).index = index;
      // // 除外するファイルを指定
      // if (this.invalidMimeTypes.includes(file.fileType)) {
      //   return false;
      // } else if (this.invalidDirNames.includes(file.filePath.split('/').pop() || '')) {
      //   return false;
      // } else { }
      return true;
    }).forEach(file => {
      const fileInfo = Object.assign(file, {
        index: this.fileInfos.length,
        // 構造化用の情報を追加。元オブジェクトの参照を切らさないためにObject.assignを使う
        path: file.filePath,
        name: file.fileName,
        disabled: false,
        depth: -1,
        pare: undefined,
        type: 'file' as 'file',
      });
      this.fileInfos.push(fileInfo);
    });
    const { root, folderList } = buildFileTreeFromFileInfo(this.fileInfos);
    this.fileTree = root;
    this.folderList = folderList;
    this.extTree = buildMimeTree(this.fileInfos);

    // ↓ビルド後に一括で親のチェック状態を再計算
    this.initializeCheckState();

    this.fileInfos.sort((a, b) => a.path.localeCompare(b.path));
    this.fileInfos.forEach(file => {
      if (this.g.invalidMimeTypes.includes(file.fileType)) {
        file.isActive = false;
        file.disabled = true;
      } else { }
    });

    this.folderList.sort((a, b) => a.path.localeCompare(b.path));
    this.folderList.forEach(folder => {
      // TODO .git, .svn等の特定のフォルダを除外する場合はここでチェックを外す .gitignore等を参照
      // folder.isActive = true;
      folder.expanded = folder.depth as number < 2;
      if (this.invalidDirNames.includes(folder.name)) {
        folder.isActive = false;
        folder.disabled = true;
        folder.expanded = false;
      }
    });
  }

  initializeCheckState(): void {
    // ファイルツリー(複数ルート)に対して実行
    this.fileTree.forEach(root => this.updateCheckStateFromChildren(root));

    // MIMEツリーにも同様
    this.extTree.forEach(root => this.updateCheckStateFromChildren(root));
  }
  private updateCheckStateFromChildren(node: OrgStruct): void {
    // フォルダ or mime であれば再帰的に子の状態を先に更新
    if (node.type === 'folder' || node.type === 'mime') {
      (node as OrgNode).children.forEach(child => {
        // 子がさらにフォルダやmimeなら再帰
        if (child.type === 'folder' || child.type === 'mime') {
          this.updateCheckStateFromChildren(child);
        }
      });

      // 子の状態が確定したあとで、親(node)の isActive と indeterminate をセット
      const children = (node as OrgNode).children;
      const activeCount = children.filter(c => c.isActive).length;

      if (activeCount === children.length) {
        node.isActive = true;
        (node as OrgNode).indeterminate = false;
      } else if (activeCount === 0) {
        node.isActive = false;
        (node as OrgNode).indeterminate = false;
      } else {
        node.isActive = false;
        (node as OrgNode).indeterminate = true;
      }
    }
  }

  setActiveRecursiveDown(node: OrgStruct, isActive: boolean, changedList: OrgStruct[]): void {
    if (node.isActive === isActive) {
    } else {
      node.isActive = isActive;
      changedList.push(node);
    }
    // フォルダの場合は子孫も再帰的に変更
    if (node.type === 'folder' || node.type === 'mime') {
      (node as OrgNode).children.forEach(child => {
        if (child.type === 'folder' || child.type === 'mime') {
          this.setActiveRecursiveDown(child, isActive, changedList);
        } else {
          // ファイルの場合はdisabledの場合があるのでisActiveを変更しないこともある
          if (child.disabled) {
            // disabledの場合はisActiveを変更しない
          } else {
            child.isActive = node.isActive;
            changedList.push(child);
          }
        }
      });
    } else { }
  }
  setActiveRecursiveUp(node: OrgStruct, isActive: boolean, changedList: OrgStruct[]): void {
    if (node.isActive === isActive) {
    } else {
      node.isActive = isActive;
      changedList.push(node);
    }
    // ルートの場合は親がないので終了
    if (node.pare) {
      let pare: OrgNode | undefined = node.pare;
      for (const child of pare.children) {
        if (child.isActive !== isActive) {

          // pare.isActive = true;
          pare.indeterminate = true;
          pare = pare.pare;
          while (pare) {
            // pare.isActive = true;
            pare.indeterminate = true;
            pare = pare.pare;
          }
          return;
        } else {
        }
      }
      pare.indeterminate = false;
      pare.isActive = isActive;
      this.setActiveRecursiveUp(pare, isActive, changedList);
    } else {
      // root
    }
  }

  readonly fileManagerService: FileManagerService = inject(FileManagerService);
  applyIsActives(files: OrgStruct[]): void {
    const ids = files.filter(file => file.type === 'file').map(file => (file as any as FileEntity).id) as string[];
    this.fileManagerService.activateFile(files[0].isActive, ids).subscribe();
  }

  switchFolder(folder: TreeNode): void {
    folder.expanded = !folder.expanded;
  }
  toggleFolder(folder: TreeNode): void {
    folder.isActive = !folder.isActive;
    folder.indeterminate = false; // 直接チェックした場合は中間状態を解除する。こうしておかないと親がチェックされたときに中間状態が解除されない
    const changedList: OrgStruct[] = [folder];
    this.setActiveRecursiveDown(folder, folder.isActive, changedList);
    this.setActiveRecursiveUp(folder, folder.isActive, changedList);
    this.applyIsActives(changedList);
  }
  toggleMimeSelection(mimeNode: MimeTreeNode): void {
    mimeNode.isActive = !mimeNode.isActive;
    mimeNode.indeterminate = false; // 直接チェックした場合は中間状態を解除する。こうしておかないと親がチェックされたときに中間状態が解除されない
    const changedList: OrgStruct[] = [mimeNode];
    this.setActiveRecursiveDown(mimeNode, mimeNode.isActive, changedList);
    this.setActiveRecursiveUp(mimeNode, mimeNode.isActive, changedList);

    // console.log(changedList);
    // 一旦消す
    const changeDetailList: OrgStruct[] = [];
    // changedListの重複を排除してソートしてfileを除く
    Array.from(new Set(changedList)).sort((a, b) => a.path.localeCompare(b.path)).filter(node => node.type === 'file').forEach((node, index, ary) => {
      if (ary[index + 1]) {
        if (ary[index + 1].path.startsWith(node.path)) {
          // 子要素側で変更検知するのでこちでは無視
        } else {
          changeDetailList.push(node); // filterでNode系に絞っているのでここはOrgNode
        }
      } else {
        // 末尾は原理的に子要素
        changeDetailList.push(node); // filterでNode系に絞っているのでここはOrgNode
      }
    });

    // console.log(changeDetailList);
    // 情報に変更検知を伝播
    changeDetailList.forEach(node => {
      this.setActiveRecursiveUp(node, node.isActive, changedList);
    });

    this.applyIsActives(changedList);
  }
  toggleFile(file: OrgStruct): void {
    file.isActive = !file.isActive;
    const changedList: OrgStruct[] = [file];
    this.setActiveRecursiveUp(file, file.isActive, changedList);
    this.applyIsActives(changedList);
  }

  /** イベント伝播しないように止める */
  stopPropagation($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }
}

