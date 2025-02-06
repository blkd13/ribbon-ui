import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { from, Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { CountTokensResponse } from './chat.service';

export interface FileUploadContent {
    filePath: string;
    base64Data: string;
}

export interface FileUploadRequest {
    uploadType: 'Single' | 'Group';
    projectId: string;
    contents: FileUploadContent[];
}

export interface FileMetadata {
    fileName?: string;
    description?: string;
}

export interface FileAccessUpdate {
    teamId: string;
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
}

export interface FileGroupEntity {
    id: string;
    projectId: string;
    type: 'upload' | 'merged' | 'gitlab' | 'gitea' | 'box' | 'github';
    label: string;
    description: string;
    uploadedBy: string;
    isActive: boolean;
}

export interface FileGroupEntityForView extends FileGroupEntity {
    files: FileEntityForView[];
}

export interface FileEntity {
    id: string;
    fileName: string;
    filePath: string;
    projectId: string;
    uploadedBy: string;
    fileBodyId: string;
    isActive: boolean;
}

export interface FileEntityForView extends FileEntity {
    // Add other properties as needed
    fileSize: number,
    fileType: string;
    metaJson: any;
    tokenCount?: { [modelId: string]: CountTokensResponse }; // JSON型を保存
}



export type FullPathFile = { fullPath: string, file: File, base64String: string, id?: string };

@Injectable({ providedIn: 'root' })
export class FileManagerService {

    private readonly http: HttpClient = inject(HttpClient);

    /***
     * API通信しない、画面上でファイルを取ってくる関数もここに纏めてしまう。
     **/

    // inputタグのtype=fileでファイル/フォルダを選択したとき
    async onFileOrFolderMultipleForInputTag(items: FileList): Promise<FullPathFile[]> {
        // inputタグで選択した場合は最初からディレクトリ配下のフルパスが全部取れてるので、形変更だけ
        const files: FullPathFile[] = [];
        for (let i = 0; i < items.length; i++) {
            console.log(`${items[i].webkitRelativePath}`);
            const file = items[i];
            files.push({ fullPath: `${file.webkitRelativePath}/${file.name}`, file, base64String: '' });
        }
        await Promise.all(files.map(file => this.readFile(file)));
        return files;
    }

    // ファイルかフォルダかを複数雑に投げ込んだときにファイルフルパスリストにして返却する
    async onFileOrFolderMultipleForDragAndDrop(items: DataTransferItemList | DataTransferItem[]): Promise<FullPathFile[]> {
        // ディレクトリだったら再帰検索する。
        const files: FullPathFile[] = [];
        const promises = [];
        for (let i = 0; i < items.length; i++) {
            console.log(i + ":" + items.length);
            const item = items[i].webkitGetAsEntry();
            if (item) {
                promises.push(this.traverseFileTree(files, item));
            } else {
                if (i === 0 && items[i].kind === 'file' && items[i].type === 'image/png') {
                    // 画像キャプチャの場合
                    files.push({ fullPath: items[i].getAsFile()?.name || 'image.png', file: items[i].getAsFile() as any, base64String: '' });
                } else {
                    //
                }
            }
        }
        await Promise.all(promises);
        await Promise.all(files.map(file => this.readFile(file)));
        return files;
    }

    private async traverseFileTree(files: FullPathFile[], item: any, path = ''): Promise<void> {
        if (item.isFile) {
            const file = await new Promise<File>((resolve) => item.file(resolve));
            const fullPath = `${path}/${item.name}`.replaceAll(/^\//g, '');
            console.log(fullPath);
            // 先頭の/は外す。
            files.push({ fullPath, file, base64String: '' });
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            let entries = await this.readEntries(dirReader);
            while (entries.length > 0) {
                for (let i = 0; i < entries.length; i++) {
                    // console.log(i + ":" + entries.length);
                    await this.traverseFileTree(files, entries[i], `${path}/${item.name}`);
                }
                entries = await this.readEntries(dirReader);
            }
        }
    }

    // readEntriesをPromiseでラップし、複数回呼び出すための関数
    private async readEntries(dirReader: any): Promise<any[]> {
        return new Promise((resolve, reject) => {
            dirReader.readEntries((entries: any[]) => {
                resolve(entries);
            }, (error: any) => {
                reject(error);
            });
        });
    }

    /**
     * 中身をbase64で読み込んでおく
     * @param file 
     * @returns 
     */
    async readFile(file: FullPathFile): Promise<FullPathFile> {
        return new Promise<FullPathFile>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (() => {
                file.base64String = reader.result as string;
                resolve(file);
            }).bind(this);
            reader.readAsDataURL(file.file);
        });
    }

    /**
     * ここから下はAPI通信系
     * @param request 
     * @returns 
     */
    uploadFiles(request: FileUploadRequest): Observable<{ message: string, results: FileGroupEntity[] }> {
        return this.http.post<{ message: string, results: FileGroupEntity[] }>(`/user/upload`, request);
    }

    downloadFile(fileId: string, format: string = 'binary'): Observable<string> {
        const params = new HttpParams().set('format', format);
        return this.http.get(`/user/${fileId}/download`, { params, responseType: 'blob' }).pipe(
            switchMap(blob => from(this.blobToBase64(blob))),
            catchError(this.handleError)
        );
    }

    activateFile(isActive: boolean, ids: string[]): Observable<{ message: string, updateResult: number }> {
        return ids.length > 0 ? this.http.patch<{ message: string, updateResult: number }>(`/user/file-activate`, { isActive, ids }) : of({ message: 'No files to update', updateResult: 0 });
    }

    private blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve(reader.result as string);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    // downloadFile(fileId: string, format: 'binary' | 'base64' = 'binary'): Observable<Blob | { fileName: string, base64Data: string }> {
    //     const params = new HttpParams().set('format', format);
    //     return this.http.get(`/user/${fileId}/download`, { params, responseType: format === 'binary' ? 'blob' : 'json', headers: this.authService.getHeaders() }).pipe(
    //         catchError(this.handleError)
    //     );
    // }

    // updateFileMetadata(fileId: string, metadata: FileMetadata): Observable<FileEntity> {
    //     return this.http.patch<FileEntity>(`/user/${fileId}/metadata`, metadata).pipe(
    //         catchError(this.handleError)
    //     );
    // }

    // deleteFile(fileId: string): Observable<any> {
    //     return this.http.delete(`/user/${fileId}`).pipe(
    //         catchError(this.handleError)
    //     );
    // }

    getFileGroup(fileGroupId: string): Observable<FileGroupEntityForView> {
        return this.http.get<FileGroupEntityForView>(`/user/file-group/${fileGroupId}`).pipe(
            catchError(this.handleError)
        );
    }

    getFileList(): Observable<FileEntity[]> {
        return this.http.get<FileEntity[]>(`/user/list`).pipe(
            catchError(this.handleError)
        );
    }

    updateFileAccess(fileId: string, accessUpdate: FileAccessUpdate): Observable<any> {
        return this.http.put(`/user/${fileId}/access`, accessUpdate).pipe(
            catchError(this.handleError)
        );
    }

    private handleError(error: any): Observable<never> {
        console.error('An error occurred:', error);
        throw error;
    }
}