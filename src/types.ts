export interface FileDisplayPluginSettings {
    // 是否启用正则表达式缓存
    enableRegexCaching: boolean;
    // 正则表达式缓存大小限制
    maxRegexCacheSize: number;
    // 其他设置...
}

export const DEFAULT_SETTINGS: FileDisplayPluginSettings = {
    enableRegexCaching: true,
    maxRegexCacheSize: 1000
}; 