export interface BoxApiUser {
    type: 'user';
    id: string;
    name: string;
    login: string;
}

export interface BoxApiPathEntry {
    type: 'folder';
    id: string;
    sequence_id: string | null;
    etag: string | null;
    name: string;

    // とりあえず使えそうな項目を追加
    modified_at?: string;
    modified_by?: BoxApiUser;
    created_at?: string;
    content_modified_at?: string;
    shared_link?: null;
    size?: number;
    // classification?: null;
    permissions?: Permissions;
}

export interface BoxApiFileVersion {
    type: 'file_version';
    id: string;
    sha1: string;
}

export interface BoxApiItemEntry {
    type: 'file' | 'web_link';
    id: string;
    file_version: BoxApiFileVersion;
    sequence_id: string;
    version_number: number;
    etag: string;
    sha1: string;
    name: string;

    // とりあえず使えそうな項目を追加
    modified_at?: string;
    modified_by?: BoxApiUser;
    created_at?: string;
    content_modified_at?: string;
    shared_link?: null;
    size?: number;
    extension?: string;
    lock?: null;
    // classification?: null;
    permissions?: Permissions;
    url?: string; //for web_link only;
}

export interface BoxApiPathCollection {
    total_count: number;
    entries: BoxApiPathEntry[];
}

export interface BoxApiItemCollection {
    total_count: number;
    entries: (BoxApiItemEntry | BoxApiPathEntry)[];
    offset: number;
    limit: number;
    order: { by: string; direction: 'ASC' | 'DESC' }[];
}

export interface BoxApiFolder {
    type: 'folder';
    id: string;
    sequence_id: string;
    etag: string;
    name: string;
    created_at: string;
    modified_at: string;
    description: string;
    size: number;
    path_collection: BoxApiPathCollection;
    created_by: BoxApiUser;
    modified_by: BoxApiUser;
    trashed_at: string | null;
    purged_at: string | null;
    content_created_at: string;
    content_modified_at: string;
    owned_by: BoxApiUser;
    shared_link: string | null;
    folder_upload_email: string | null;
    parent: BoxApiPathEntry;
    item_status: 'active' | string;  // 他の状態がある場合はここに追加
    item_collection: BoxApiItemCollection;
}


// --------------------------------------------------
export interface BoxApiCollection {
    type: string;
    name: string;
    collection_type: string;
    id: string;
    items?: BoxApiCollectionItem;
}

export interface BoxApiCollectionItem {
    total_count: number;
    entries: BoxApiCollectionItemEntry[];
    limit: number;
    offset: number;
}

export interface BoxApiCollectionItemEntry {
    type: string; // 'folder' | other types if applicable
    id: string;
    sequence_id: string;
    etag: string;
    name: string;
}

export interface BoxApiCollectionList {
    total_count: number;
    limit: number;
    offset: number;
    entries: BoxApiCollection[];
}

// --------------------------------------------------
export interface BoxApiEventResponse {
    chunk_size: number;
    entries: BoxApiEventEntry[];
    next_stream_position: number;
}

export interface BoxApiEventEntry {
    additional_details: Record<string, any>;
    created_at: string; // ISO 8601 date string
    created_by: BoxApiUserInfo;
    event_id: string;
    event_type: string;
    recorded_at: string; // ISO 8601 date string
    session_id: string;
    source: EventSource;
    type: string;
}

export interface BoxApiUserInfo {
    id: string;
    type: string;
    login: string;
    name: string;
}

export interface BoxApiEventSource {
    id: string;
    type: string;
    login: string;
    name: string;
    address: string;
    avatar_url: string;
    created_at: string; // ISO 8601 date string
    job_title: string;
    language: string;
    max_upload_size: number;
    modified_at: string; // ISO 8601 date string
    notification_email: BoxApiNotificationEmail;
    phone: string;
    space_amount: number;
    space_used: number;
    status: string;
    timezone: string;
}

export interface BoxApiNotificationEmail {
    email: string;
    is_confirmed: boolean;
}


// --------------------------------------------------

export interface BoxApiFileVersion {
    type: 'file_version';
    id: string;
    sha1: string;
}

export interface BoxApiFileEntry {
    type: 'file';
    id: string;
    file_version: BoxApiFileVersion;
    sequence_id: string;
    etag: string;
    sha1: string;
    name: string;
    version_number: number;

    description: string;
    size: number;
    path_collection: BoxApiPathCollection;
    created_at: string;
    modified_at: string;
    trashed_at: null;
    purged_at: null;
    content_created_at: string;
    content_modified_at: string;
    created_by: BoxApiUser;
    modified_by: BoxApiUser;
    owned_by: BoxApiUser;
    shared_link: null;
    parent: BoxApiFolder;
    item_status: 'active';
}

export type BoxApiEntry = BoxApiFileEntry | BoxApiFolder;

export interface BoxApiSearchResults {
    total_count: number;
    entries: BoxApiEntry[];
    limit: number;
    offset: number;
    type: 'search_results_items';
}

// --------------------------------------------------
export interface BoxApiPermissions {
    can_download: boolean;
    can_upload: boolean;
    can_rename: boolean;
    can_delete: boolean;
    can_share: boolean;
    can_invite_collaborator: boolean;
    can_set_share_access: boolean;
    can_preview?: boolean;
    can_comment?: boolean;
    can_annotate?: boolean;
    can_view_annotations_all?: boolean;
    can_view_annotations_self?: boolean;
    can_create_annotations?: boolean;
    can_view_annotations?: boolean;
}

export interface BoxApiFolderItemEntry {
    type: 'folder';
    id: string;
    etag: string;
    name: string;
    modified_at: string;
    modified_by: BoxApiUser;
    created_at: string;
    content_modified_at: string;
    shared_link: null;
    size: number;
    classification: null;
    permissions: Permissions;
}

export interface BoxApiFileItemEntry {
    type: 'file';
    id: string;
    etag: string;
    name: string;
    modified_at: string;
    modified_by: BoxApiUser;
    created_at: string;
    content_modified_at: string;
    shared_link: null;
    size: number;
    extension: string;
    lock: null;
    classification: null;
    permissions: Permissions;
}

export interface BoxApiOrder {
    by: 'type' | 'name';
    direction: 'ASC' | 'DESC';
}

export interface BoxApiFolderItemListResponse {
    total_count: number;
    entries: (BoxApiFolderItemEntry | BoxApiFileItemEntry)[];
    offset: number;
    limit: number;
    order: BoxApiOrder[];
}



export interface BoxMkdirErrorResponse {
    type: "error";
    status: number;
    code: string;
    context_info: {
        conflicts: ConflictInfo[];
    };
    help_url: string;
    message: string;
    request_id: string;
}
export interface BoxUploadErrorResponse {
    type: "error";
    status: number;
    code: string;
    context_info: {
        conflicts: ConflictInfo;
    };
    help_url: string;
    message: string;
    request_id: string;
}

interface ConflictInfo {
    type: "file";
    id: string;
    file_version: FileVersionInfo;
    sequence_id: string;
    etag: string;
    sha1: string;
    name: string;
}

interface FileVersionInfo {
    type: "file_version";
    id: string;
    sha1: string;
}
