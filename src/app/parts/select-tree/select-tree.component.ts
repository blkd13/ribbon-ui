import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';

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
  // const extList = Array.from(new Set(_files.map(file => file.path.split('.').pop() || ''))).sort();
  const extList: MimeTreeNode[] = [];
  const extMap = {} as { [ext: string]: MimeTreeNode };
  const extMimeMap = {} as { [ext: string]: { [fileType: string]: MimeTreeNode } };
  _files.forEach(file => {
    const ext = file.path.includes('.') ? (file.path.split('.').pop() || '') : '';
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
    } else { }
    if (!extMimeMap[ext]) {
      extMimeMap[ext] = {};
    } else { }
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
    } else { }
    extMimeMap[ext][file.fileType].children.push(file as any); // 無理矢理file入れておく
  });
  extList.sort((a, b) => a.name.localeCompare(b.name));
  extList.forEach(extNode => {
    const mimes = Object.values(extMimeMap[extNode.name]);
    mimes.sort((a, b) => a.name.localeCompare(b.name));
    extNode.children = mimes;
  });

  if (extList[0].name === '') {
    // 拡張子がないものを最後に持っていく
    const noExt = extList.shift();
    extList.push(noExt as any);
  } else { }
  return extList;
}

@Component({
    selector: 'app-file-tree',
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
  ngOnInit(): void {
    const { root, folderList } = buildFileTreeFromFileInfo(this.fileInfos);
    this.fileTree = root;
    this.folderList = folderList;
    this.extTree = buildMimeTree(this.fileInfos);

    this.fileInfos.sort((a, b) => a.path.localeCompare(b.path));
    this.fileInfos.forEach(file => {
      // TODO mime等でのフィルターを考慮してisCheckedの初期値を設定
      file.isActive = true;
    });

    this.folderList.sort((a, b) => a.path.localeCompare(b.path));
    this.folderList.forEach(folder => {
      // TODO .git, .svn等の特定のフォルダを除外する場合はここでチェックを外す .gitignore等を参照
      // folder.isActive = true;
      folder.expanded = folder.depth as number < 2;
    });
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

  switchFolder(folder: TreeNode): void {
    folder.expanded = !folder.expanded;
  }
  toggleFolder(folder: TreeNode): void {
    folder.isActive = !folder.isActive;
    folder.indeterminate = false; // 直接チェックした場合は中間状態を解除する。こうしておかないと親がチェックされたときに中間状態が解除されない
    const changedList: OrgStruct[] = [folder];
    this.setActiveRecursiveDown(folder, folder.isActive, changedList);
    this.setActiveRecursiveUp(folder, folder.isActive, changedList);
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
  }
  toggleFile(file: OrgStruct): void {
    file.isActive = !file.isActive;
    const changedList: OrgStruct[] = [file];
    this.setActiveRecursiveUp(file, file.isActive, changedList);
  }

  /** イベント伝播しないように止める */
  stopPropagation($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }
}
