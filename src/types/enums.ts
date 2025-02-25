export enum FileEventType {
    OPEN = 'file-open',
    RENAME = 'rename',
    CREATE = 'create',
    DELETE = 'delete'
}

export enum CacheOperation {
    ADD = 'add',
    GET = 'get',
    CLEAR = 'clear',
    UPDATE = 'update'
}

export enum ValidationResult {
    SUCCESS = 'success',
    INVALID_REGEX = 'invalid_regex',
    INVALID_GROUP = 'invalid_group',
    INVALID_NUMBER = 'invalid_number',
    INVALID_FOLDER = 'invalid_folder'
}
