import { TFile, TFolder, CachedMetadata } from 'obsidian';

// 插件设置接口
export interface FileDisplayPluginSettings {
    activeFolder: string;
    enablePlugin: boolean;
    fileNamePattern: string;  // 文件名匹配模式
    captureGroup: number;     // 要显示的捕获组索引
    batchSize: number;        // 文件遍历批次大小
    showOriginalNameOnHover: boolean;
}

// 默认设置
export const DEFAULT_SETTINGS: FileDisplayPluginSettings = {
    activeFolder: '',
    enablePlugin: true,
    fileNamePattern: '^(.+?)_\\d{4}_\\d{2}_\\d{2}_(.+)$', // 默认保持原来的格式
    captureGroup: 2,     // 默认显示第二个捕获组
    batchSize: 100,      // 每批处理100个文件
    showOriginalNameOnHover: true
}

// 文件缓存项接口
export interface FileCacheItem {
    files: TFile[];
    metadata: CachedMetadata;
    timestamp: number;
}

// 显示管理器配置接口
export interface DisplayManagerConfig {
    fileNamePattern: string;
    captureGroup: number;
    showOriginalNameOnHover: boolean;
}  
