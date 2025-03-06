import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, delay, from, concatMap, map, Observable, of, retry, Subject, switchMap, tap, timer, toArray } from 'rxjs';
import { Client4, WebSocketClient, WebSocketMessage } from '@mattermost/client';
import emojiData from 'emoji-datasource';
import { CustomEmoji } from '@mattermost/types/emojis';
import { Thread, ThreadGroup } from '../models/project-models';
import { FileEntity, FileManagerService, FileUploadContent, FullPathFile } from './file-manager.service';
import { Utils } from '../utils';

@Injectable({ providedIn: 'root' })
export class ApiMattermostService {

  private readonly http: HttpClient = inject(HttpClient);

  public baseUrl = '/user/oauth/api/proxy/mattermost/api/v4';

  mmUser?: MattermostUser;

  mattermostMe(): Observable<MattermostUser> {
    const url = `${this.baseUrl}/users/me`;
    return this.http.get<MattermostUser>(url).pipe(tap(mmUser => this.mmUser = mmUser));
  }

  getUsersByIdsOrNamesSet(userIdSet: Set<string> = new Set(), userNameSet: Set<string> = new Set()): Observable<MattermostUser[]> {
    const userIdAry = Array.from(userIdSet);
    const userNameAry = Array.from(userNameSet);
    return this.getUsersByIdsOrNames(userIdAry, userNameAry);
  }

  getUsersByIdsOrNames(userIds: string[] = [], userNames: string[] = []): Observable<MattermostUser[]> {
    if (userIds.length === 0 && userNames.length === 0) {
      return of([]);
    } else {
      const url = `/user/mattermost/user`;
      return this.http.post<MattermostUser[]>(url, { ids: userIds, names: userNames }).pipe(tap(users =>
        users.forEach(user => user.nickname = user.nickname || user.last_name || user.first_name || user.username)
      ));
    }
  }

  mattermostCreatePost(post: { channel_id: string; message: string; root_id?: string; file_ids?: string[]; props?: any; metadata?: any }): Observable<MattermostPost> {
    const url = `${this.baseUrl}/posts`;
    return this.http.post<MattermostPost>(url, post, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  }

  mattermostPatchPost(postId: string, post: { channel_id: string; message: string; root_id?: string; file_ids?: string[]; props?: any; metadata?: any }): Observable<MattermostPost> {
    const url = `${this.baseUrl}/posts/${postId}/patch`;
    return this.http.patch<MattermostPost>(url, { message: post.message, file_ids: post.file_ids, props: post.props }, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  }

  mattermostDeletePost(postId: string): Observable<MattermostPost> {
    const url = `${this.baseUrl}/posts/${postId}`;
    return this.http.delete<MattermostPost>(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  }

  mattermostUserAutocomplete(in_team: string, in_channel: string, name: string = '', limit = 25): Observable<{ users: MattermostUser[] }> {
    const url = `${this.baseUrl}/users/autocomplete?in_team=${in_team}&in_channel=${in_channel}&name=${name}&limit=${limit}`;
    return this.http.get<{ users: MattermostUser[] }>(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .pipe(
        retry({
          count: 3,
          delay: (error, retryCount) => {
            // 403エラーの場合のみ1秒待ってリトライ
            if (error.status === 403) {
              return timer(1000);
            }
            // その他のエラーはリトライしない
            throw error;
          }
        }),
      );
  }

  mattermostCreateDraft(post: { channel_id: string; message: string; root_id?: string; file_ids?: string[]; }): Observable<MattermostPost> {
    // draftが上手く消せてなくて残り続けてしまっているので一旦登録自体をやめる
    return of();
    // if (post.message || (post.file_ids && post.file_ids.length > 0)) {
    //   const url = `${this.baseUrl}/drafts`;
    //   return this.http.post<MattermostPost>(url, post, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    // } else {
    //   const url = `${this.baseUrl}/users/me/channels/${post.channel_id}/drafts`;
    //   return this.http.delete<MattermostPost>(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    // }
  }
  mattermostGetDrafts(teamId: string): Observable<MattermostPost[]> {
    const url = `${this.baseUrl}/users/me/teams/${teamId}/drafts`;
    console.log(`drafst ${teamId}`);
    return this.http.get<MattermostPost[]>(url);
  }

  mattermostTyping(channel_id: string, postId?: string): void {
    this.wsClient.userTyping(channel_id, postId || '');
  }

  mattermostCreateReaction(post_id: string, emoji_name: string): Observable<void> {
    const url = `${this.baseUrl}/reactions`;
    return this.http.post<void>(url, { user_id: this.mmUser?.id, post_id, emoji_name, create_at: 0 }, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  }

  mattermostRemoveReaction(post_id: string, emoji_name: string): Observable<void> {
    const url = `${this.baseUrl}/users/me/posts/${post_id}/reactions/${emoji_name}`;
    return this.http.delete<void>(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  }

  mattermostView(channel_id: string): Observable<void> {
    const url = `${this.baseUrl}/channels/members/me/view`;
    return this.http.post<void>(url, { channel_id, collapsed_threads_supported: true }, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  }

  /** 自身の所属チーム全量 */
  mattermostTeams(): Observable<MattermostTeam[]> {
    const url = `${this.baseUrl}/users/me/teams`;
    return this.http.get<MattermostTeam[]>(url);
  }

  /** Channelのカテゴリ（favoriteとか）を取る */
  mattermostChannelsCategories(teamId: string): Observable<MattermostChannelsCategoriesResponse> {
    const url = `${this.baseUrl}/users/me/teams/${teamId}/channels/categories`;
    return this.http.get<MattermostChannelsCategoriesResponse>(url);
  }
  /** Channelの未読件数とかを取る */
  mattermostChannelsMembers(teamId: string): Observable<MattermostChannelsMembersResponse> {
    const url = `${this.baseUrl}/users/me/teams/${teamId}/channels/members`;
    return this.http.get<MattermostChannelsMembersResponse>(url);
  }

  channels: MattermostChannel[] = [];
  /** これが自身の関与チャネル全量 */
  userChannels(last_delete_at: number = 0, include_deleted = false): Observable<MattermostChannel[]> {
    const url = `${this.baseUrl}/users/me/channels?last_delete_at=${last_delete_at}&include_deleted=${include_deleted}`;
    return this.http.get<MattermostChannel[]>(url).pipe(switchMap(mmChannelList => {
      // ダイレクトチャネルとグループチャネルの個人名を補充する。
      const ids = new Set<string>();
      const names = new Set<string>();
      mmChannelList.forEach(mmChannel => {
        mmChannel.groupMemberIdList = [];
        if (mmChannel.display_name) {
          if (mmChannel.type === 'G') {
            // 空白を削ってカンマで区切ってnameに入れる
            mmChannel.groupMemberIdList = mmChannel.display_name.replaceAll(/ /g, '').split(',');
            mmChannel.groupMemberIdList.forEach(username => names.add(username));
            mmChannel.groupMemberIdList = mmChannel.groupMemberIdList.filter(id => id !== this.mmUser?.username);
          } else {
            // グループ以外は無視
          }
        } else {
          if (mmChannel.type === 'D') {
            // 無名のダイレクトチャネルは名前を取ってくる。
            mmChannel.groupMemberIdList = mmChannel.name.split('__');
            mmChannel.groupMemberIdList.forEach(id => ids.add(id));
            mmChannel.groupMemberIdList = mmChannel.groupMemberIdList.filter(id => id !== this.mmUser?.id);
            if (mmChannel.groupMemberIdList.length === 0 && this.mmUser) {
              mmChannel.groupMemberIdList = [this.mmUser.id];
            } else { }
          } else {
            // ダイレクトチャネル以外は無視
          }
        }
      });
      return this.getUsersByIdsOrNames(Array.from(ids), Array.from(names)).pipe(
        map(next => {
          const idMas: { [key: string]: MattermostUser } = {};
          const nameMas: { [key: string]: MattermostUser } = {};
          next.forEach(user => {
            idMas[user.id] = user;
            nameMas[user.username] = user;
          });
          mmChannelList.forEach(mmChannel => {
            if (mmChannel.display_name) {
              if (mmChannel.type === 'G') {
                // 空白を削ってカンマで区切ってnameに入れる
                // mmChannel.display_name = 'dummy';
                mmChannel.display_name = mmChannel.display_name.replaceAll(/ /g, '').split(',').filter(username => username !== this.mmUser?.username).map(username => nameMas[username]?.nickname || nameMas[username]?.username || '').filter(name => name.trim()).join(', ');
                // console.log(mmChannel.display_name);
              } else {
                // グループ以外は無視
              }
            } else {
              if (mmChannel.type === 'D') {
                // 無名のダイレクトチャネルは名前を取ってくる。
                if (mmChannel.name === `${this.mmUser?.id}__${this.mmUser?.id}`) {
                  mmChannel.display_name = this.mmUser?.nickname || this.mmUser?.username || '';
                } else {
                  mmChannel.display_name = 'dummy';
                  mmChannel.display_name = mmChannel.name.split('__').filter(id => id !== this.mmUser?.id).map(id => idMas[id].nickname || idMas[id].username || '').filter(name => name.trim()).join(', ');
                }
                // console.log(mmChannel.display_name);
              } else {
                // ダイレクトチャネル以外は無視
              }
            }
          });
          return mmChannelList;
        })
      )
    }));
  }

  /** チャネル内のpostsを取る */
  mattermostChannelsPosts(channelId: string, page: number = 0, per_page: number = 60, since?: number, before?: string, after?: string, include_deleted: boolean = false): Observable<ChannelPosts> {
    const url = `${this.baseUrl}/channels/${channelId}/posts`;
    return this.http.get<ChannelPosts>(url);
  }

  /** emojiIDを取る */
  mattermostGetEmojiByName(emoji_name: string): Observable<CustomEmoji> {
    const url = `${this.baseUrl}/emoji/name/${emoji_name}`;
    return this.http.get<CustomEmoji>(url);
  }

  mattermostGetEmoji(page: number = 0, per_page: number = 200, sort: string = 'name'): Observable<MattermostEmoji[]> {
    const url = `${this.baseUrl}/emoji?page=${page}&per_page=${per_page}&sort=${sort}`;
    return this.http.get<MattermostEmoji[]>(url);
  }

  mattermostSearchEmoji(term: string): Observable<MattermostEmoji[]> {
    const url = `${this.baseUrl}/emoji/search`;
    return this.http.post<MattermostEmoji[]>(url, { term }, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  }

  /** 設定一覧 */
  preference(): Observable<Preference[]> {
    const url = `${this.baseUrl}/users/me/preferences`;
    return this.http.get<Preference[]>(url);
  }

  mattermostArchivedChannels(): Observable<MattermostTeam[]> {
    const url = `${this.baseUrl}/users/me/teams`;
    return this.http.get<MattermostTeam[]>(url);
  }
  mattermostTeamsUnread(): Observable<MattermostTeamUnread[]> {
    const url = `${this.baseUrl}/users/me/teams/unread`;
    return this.http.get<MattermostTeamUnread[]>(url);
  }
  mattermostChannels(teamId: string): Observable<MattermostChannel[]> {
    const url = `${this.baseUrl}/teams/${teamId}/channels`;
    return this.http.get<MattermostChannel[]>(url);
  }

  mattermostUserTeamsChannels(teamId: string): Observable<MattermostChannel[]> {
    const url = `${this.baseUrl}/users/me/teams/${teamId}/channels`;
    return this.http.get<MattermostChannel[]>(url);
  }
  mattermostChannel(channelId: string): Observable<MattermostChannel[]> {
    const url = `${this.baseUrl}/channels/${channelId}`;
    return this.http.get<MattermostChannel[]>(url);
  }
  mattermostThreads(teamId: string): Observable<{ threads: MattermostThread[] }> {
    const url = `${this.baseUrl}/users/me/teams/${teamId}/threads`;
    return this.http.get<{ threads: MattermostThread[] }>(url);
  }
  // mattermostPosts(teamId: string, channelId: string): Observable<{ posts: MattermostPost[] }> {
  //   const url = `${this.baseUrl}/users/me/channels/${channelId}/posts/unread`;
  //   return this.http.get<{ posts: MattermostPost[] }>(url);
  // }

  mattermostFilesUpload(channelId: string, files: FullPathFile[]): Observable<FilesOutDto[]> {
    const clientIds = [Utils.generateUUID()]; // 重複しないような適当なID
    const url = `${this.baseUrl}/files`;
    return from(files).pipe( // ファイルの配列をObservableに変換
      concatMap(file => {
        const formData: FormData = new FormData();
        formData.append('channel_id', channelId);
        formData.append('client_ids', clientIds.join(','));
        formData.append('files', file.file, file.fullPath.split('/').pop());
        return this.http.post<FilesOutDto>(url, formData, {
          reportProgress: true,
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
      }),
      toArray(), // 全ての処理が終わるまで待って、結果を配列にまとめる
    );
  }


  private subject: Subject<MessageEvent>;
  private wsClient!: WebSocketClient;
  private client!: Client4;
  private listener: Subject<WebSocketMessage>;

  public emojiMap: { [key: string]: string } = {};

  constructor() {
    this.subject = new Subject<MessageEvent>();
    this.wsClient = new WebSocketClient();
    this.client = new Client4();
    this.listener = new Subject<WebSocketMessage>();

    emojiData.reduce((mas, curr) => {
      curr.short_names.forEach(name => mas[name] = curr.image);
      return mas;
    }, this.emojiMap as { [key: string]: string });
  }

  connect(): Observable<WebSocketMessage> {
    this.wsClient.initialize(`/api${this.baseUrl}/websocket`, '');
    this.wsClient.addMessageListener((message: WebSocketMessage) => {
      console.log(message);
      this.listener.next(message);
    });
    this.wsClient.addErrorListener((event: Event) => {
      this.listener.next({ event: 'error', data: { event }, broadcast: { omit_users: {}, user_id: '', channel_id: '', team_id: '', }, seq: -1, });
    });
    this.wsClient.addCloseListener((connectFailCount: number) => {
      this.listener.next({ event: 'close', data: { connectFailCount }, broadcast: { omit_users: {}, user_id: '', channel_id: '', team_id: '', }, seq: -1, });
    });
    return this.listener;
  }
}
export interface Preference {
  user_id: string;
  category: string;
  name: string;
  value: string;
}

export interface MattermostChannelsCategory {
  id: string;
  user_id: string;
  team_id: string;
  sort_order: number;
  sorting: string;
  type: string;
  display_name: string;
  muted: boolean;
  collapsed: boolean;
  channel_ids: string[];
}

export interface MattermostChannelsCategoriesResponse {
  categories: MattermostChannelsCategory[];
  order: string[];
}
export interface MattermostChannelsMembers {
  channel_id: string;
  user_id: string;
  roles: string;
  last_viewed_at: number;
  msg_count: number;
  mention_count: number;
  mention_count_root: number;
  urgent_mention_count: number;
  msg_count_root: number;
  notify_props: {
    desktop: string;
    email: string;
    ignore_channel_mentions: string;
    mark_unread: string;
    push: string;
  };
  last_update_at: number;
  scheme_guest: boolean;
  scheme_user: boolean;
  scheme_admin: boolean;
  explicit_roles: string;
}
export type MattermostChannelsMembersResponse = MattermostChannelsMembers[];


export interface MattermostChannelCategoryForView {
  id: string;
  user_id: string;
  team_id: string;
  sort_order: number;
  sorting: string;
  type: string;
  display_name: string;
  muted: boolean;
  collapsed: boolean;
  channels: MattermostChannelForView[];
}

export interface MattermostTeam {
  id: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  display_name: string;
  name: string;
  description: string;
  email: string;
  type: 'O' | 'I';  // 'O' for public, 'I' for invite-only
  company_name: string;
  allowed_domains: string;
  invite_id: string;
  allow_open_invite: boolean;
  last_team_icon_update: number;
  scheme_id: string | null;
  group_constrained: boolean;
  policy_id: string | null;
}

export interface MattermostTeamUnread {
  team_id: string;
  msg_count: number;
  mention_count: number;
}

export type MattermostTeamForView = MattermostTeam & MattermostTeamUnread & { channelList: MattermostChannelForView[], caegoryChannelList: MattermostChannelCategoryForView[], isChecked: 0 | 1 | 2 };
export interface MattermostChannel {
  id: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  team_id: string;
  type: 'D' | 'G' | 'O' | 'P';  // 'D' for direct , 'G' for group, 'O' for open, 'P' for private
  display_name: string;
  name: string;
  header: string;
  purpose: string;
  last_post_at: number;
  total_msg_count: number;
  extra_update_at: number;
  creator_id: string;
  scheme_id: string | null;
  props: any | null; // または具体的な型を指定
  group_constrained: boolean | null;
  shared: boolean | null;
  total_msg_count_root: number;
  policy_id: string | null;
  last_root_post_at: number;

  groupMemberIdList: string[];
}
export interface MattermostChannelForView extends MattermostChannel {
  isChecked: boolean;
  // unreadCount: number;
  // mentionCount: number;
  // lastPost: MattermostPost;
}
export interface MattermostThread {
  id: string;
  reply_count: number;
  last_reply_at: number;
  participants: MattermostUser[];
  is_following: boolean;
  post: MattermostPost;
  unread_mentions: number;
  unread_replies: number;
}

export interface MattermostUser {
  roles: string;
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  nickname: string;
}

// export interface MattermostPost {
//   id: string;                     // ポストの一意のID
//   create_at: number;              // ポストが作成されたタイムスタンプ (ミリ秒)
//   update_at: number;              // ポストが更新されたタイムスタンプ (ミリ秒)
//   edit_at: number;                // ポストが編集されたタイムスタンプ (ミリ秒)
//   delete_at: number;              // ポストが削除されたタイムスタンプ (ミリ秒)
//   is_pinned: boolean;             // ポストがピン留めされているかどうか
//   user_id: string;                // ポストを作成したユーザーのID
//   channel_id: string;             // ポストが属するチャネルのID
//   root_id: string;                // スレッドの親ポストのID (スレッドのリプライでない場合は空)
//   original_id: string;            // 元のポストのID (エディタで変更される前のポストのID)
//   message: string;                // ポストのメッセージ内容
//   type: string;                   // ポストの種類 (通常は "system" や "custom" などの値)
//   props: Record<string, any>;     // カスタムプロパティ
//   hashtags: string;               // ポストに含まれるハッシュタグ
//   pending_post_id: string;        // クライアント側で生成された一時的なID (サーバーに送信される前のID)
//   reply_count: number;            // スレッドのリプライ数
//   last_reply_at: number;          // 最後にリプライされたタイムスタンプ (ミリ秒)
//   participants: string[];         // スレッドの参加者のユーザーIDリスト
//   metadata: MattermostPostMetadata;         // ポストに関連するメタデータ (ファイル、反応、メンションなど)
// }

// type MattermostPostMetadata = {
//   embeds: MattermostEmbed[];                // 埋め込みメディアの情報
//   emojis: MattermostEmoji[];                // カスタム絵文字
//   files: MattermostFileInfo[];              // 添付ファイル情報
//   images: Record<string, MattermostImage>;  // ポストに含まれる画像情報
//   reactions: MattermostReaction[];          // ポストに対するリアクション
//   mentions: MattermostMention[];            // メンションされたユーザー
// };

// type MattermostEmbed = {
//   type: string;                   // 埋め込みの種類 (リンクプレビュー、画像など)
//   url: string;                    // 埋め込みのURL
//   data: Record<string, any>;      // 埋め込みの詳細データ
// };

// type MattermostEmoji = {
//   name: string;                   // 絵文字の名前
//   unified: string;                // 絵文字のコードポイント
//   custom: boolean;                // カスタム絵文字かどうか
// };

// type MattermostFileInfo = {
//   id: string;                     // ファイルのID
//   name: string;                   // ファイル名
//   extension: string;              // ファイルの拡張子
//   size: number;                   // ファイルサイズ (バイト単位)
//   mime_type: string;              // MIMEタイプ
//   has_preview_image: boolean;     // プレビュー画像があるかどうか
// };

interface MattermostFileInfo {
  id: string;
  user_id: string;
  channel_id: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  name: string;
  extension: string;
  size: number;
  mime_type: string;
  width: number;
  height: number;
  has_preview_image: boolean;
  mini_preview: string;
  remote_id: string;
  archived: boolean;
}

interface FilesOutDto {
  file_infos: MattermostFileInfo[];
  client_ids: string[];
}


// type MattermostImage = {
//   url: string;                    // 画像のURL
//   height: number;                 // 画像の高さ
//   width: number;                  // 画像の幅
// };

// type MattermostReaction = {
//   user_id: string;                // リアクションを付けたユーザーのID
//   post_id: string;                // リアクションが付いたポストのID
//   emoji_name: string;             // 使用された絵文字の名前
// };

// type MattermostMention = {
//   user_id: string;                // メンションされたユーザーのID
// };



export interface MattermostAcknowledgement {
  user_id: string;
  post_id: string;
  acknowledged_at: number;
}

export interface MattermostReaction {
  user_id: string;
  post_id: string;
  emoji_name: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  remote_id: string;
  channel_id: string;
}

export interface MattermostFile {
  id: string;
  user_id: string;
  post_id: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  name: string;
  extension: string;
  size: number;
  mime_type: string;
  mini_preview: string;
  width: number;
  height: number;
  has_preview_image: boolean;
}

export interface MattermostEmoji {
  id: string;
  creator_id: string;
  name: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  // 勝手に追加した項目
  reactions?: {
    user_id: string,
    nickname: string,
  }[];
  // 勝手に追加した項目
  reactions_text?: string;
}
export interface MattermostEmojiForView extends MattermostEmoji {
  reactions: {
    user_id: string,
    nickname: string,
  }[];
}
export interface MattermostEmbed {
  type: string;
  url: string;
  data: object;
}

export interface MattermostMetadata {
  embeds: MattermostEmbed[];
  emojis: MattermostEmoji[];
  files: MattermostFile[];
  images: object;
  reactions: MattermostReaction[];
  priority: {
    priority: string;
    requested_ack: boolean;
  };
  acknowledgements: MattermostAcknowledgement[];
}

export interface MattermostPost {
  id: string;
  create_at: number;
  update_at: number;
  delete_at: number;
  edit_at: number;
  user_id: string;
  channel_id: string;
  root_id: string;
  original_id: string;
  message: string;
  type: string;
  props: object;
  hashtag: string;
  file_ids: string[];
  pending_post_id: string;
  metadata: MattermostMetadata;
}

export interface MattermostPosts {
  [key: string]: MattermostPost;
}

export interface MattermostDataStructure {
  order: string[];
  posts: MattermostPosts;
  next_post_id: string;
  prev_post_id: string;
  has_next: boolean;
}
export interface Post {
  id: string;
  create_at: number;
  update_at: number;
  edit_at: number;
  delete_at: number;
  is_pinned: boolean;
  user_id: string;
  channel_id: string;
  root_id: string;
  original_id: string;
  message: string;
  messageForView: string; // 編集前メッセージ
  type: string;
  props: {};
  hashtags: string;
  pending_post_id: string;
  reply_count: number;
  last_reply_at: number;
  participants: null;
  mentions?: string[]; // 勝手に追加
  metadata: {
    emojis?: MattermostEmoji[];
    reactions?: {
      user_id: string;
      post_id: string;
      emoji_name: string;
      create_at: number;
      update_at: number;
      delete_at: number;
      remote_id: string;
      channel_id: string;
    }[];
    files?: { id: string, name: string, mime_type: string, dataUrl?: string }[];
  };
  has_reactions?: boolean;
}



export interface ChannelPosts {
  order: string[];
  posts: {
    [key: string]: Post;
  };
  next_post_id: string;
  prev_post_id: string;
  has_next: boolean;
  first_inaccessible_post_time: number;
}











export interface MattermostTimeline {
  id: string;
  userId: string;
  title: string;
  description?: string;
  channels: MattermostTimelineChannel[];
  channelIdMas: { [channelId: string]: MattermostTimelineChannel };
  // createdAt: Date;
  // updatedAt: Date;
  // createdBy: string;
  // updatedBy: string;
  status: string;
}

export interface MattermostTimelineChannel {
  id: string;
  timelineId: string;
  channelId: string;
  isMute: boolean;
  lastViewedAt: Date;
  createdAt: Date;
  // updatedAt: Date;
  // createdBy: string;
  // updatedBy: string;
}
// export interface MattermostTimelineForView {
//   channels: MattermostTimelineChannelForView[];
// }
// export interface MattermostTimelineChannelForView {
// }

@Injectable({
  providedIn: 'root'
})
export class MattermostTimelineService {
  private apiUrl = `/user/mattermost/timeline`; // APIのベースURLを適切に設定してください

  constructor(private http: HttpClient) { }

  getTimelines(): Observable<MattermostTimeline[]> {
    return this.http.get<MattermostTimeline[]>(this.apiUrl).pipe(tap(ret => {
      // timelineを名前でソートしておく。（jsのsortは破壊的なので代入する必要はない）
      ret.sort((a, b) => {
        if (a.title < b.title) return -1;
        if (a.title > b.title) return 1;
        return 0;
      });

      // 型をDate型にしておく
      ret.forEach(timeline => {
        // TODO 本当は何かの順で並び替え出来るようにした方が良いかも・・？とりあえず毎回違うとうざいから適当にIDで並べておく。
        timeline.channels.sort((a, b) => {
          if (a.channelId < b.channelId) return -1;
          if (a.channelId > b.channelId) return 1;
          return 0;
        });
        // 
        timeline.channels.forEach(timelineChannel => {
          if (timelineChannel.lastViewedAt) {
            // 最終閲覧時刻が入っていたらDate型に変換しておく。
            timelineChannel.lastViewedAt = new Date(timelineChannel.lastViewedAt);
          } else { }
        });
        // channelIdから逆引きできるマスタを用意しておく。
        timeline.channelIdMas = timeline.channels.reduce((mas, curr, index) => {
          mas[curr.channelId] = curr;
          return mas;
        }, {} as { [channelId: string]: MattermostTimelineChannel });
      });
    }));
  }

  createTimeline(timeline: { title: string; description?: string; channelIds?: string[] }): Observable<MattermostTimeline> {
    return this.http.post<MattermostTimeline>(this.apiUrl, timeline);
  }

  updateTimeline(id: string, timeline: { title?: string; description?: string; channelIds?: string[] }): Observable<MattermostTimeline> {
    return this.http.patch<MattermostTimeline>(`${this.apiUrl}/${id}`, timeline);
  }

  updateTimelineChannel(timelineId: string, timelineChannelId: string, timelineChannel: { isMute?: boolean, lastViewedAt?: Date }): Observable<MattermostTimelineChannel> {
    return this.http.patch<MattermostTimelineChannel>(`${this.apiUrl}/${timelineId}/channel/${timelineChannelId}`, timelineChannel);
  }

  deleteTimeline(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  mattermostToAi(projectId: string, id: string, idType: ToAiIdType, title: string, filterType: ToAiFilterType, params: any, systemPrompt: string): Observable<{ threadGroup: ThreadGroup }> {
    return this.http.post<any>(`${this.apiUrl}/to-ai`, { projectId, id, idType, title, filterType, params, systemPrompt });
  }
}
export type ToAiIdType = 'timeline' | 'timelineChannel' | 'channel' | 'thread';
export type ToAiFilterType = 'timespan' | 'count' | 'batch';