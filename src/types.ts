import { Plugin } from 'obsidian';
import { Extension } from '@codemirror/state';
import { CacheCleanStrategy, ILinkStateManager } from './services/interfaces/IServices';
import { ExtensionCacheService } from './services/ExtensionCacheService';

export interface TitleExtractorSettings {
    pattern: string;
    useYamlTitleWhenAvailable: boolean;
    preferFrontmatterTitle: boolean;
    enabledFolders: string[];
    enableEditorLinkDecorations: boolean;
    cacheCleanStrategy: CacheCleanStrategy;
    persistentCacheHeatThreshold: number;
    fallbackToDOMForFileExplorer: boolean;
    cacheMigrationV1?: boolean;
    performanceThreshold: number;
    processingPriority: {
        highPriorityFolders: string[];
        lowPriorityFolders: string[];
    };
    additionalPatterns: {
        enabled: boolean;
        patterns: string[];
        matchMode: 'first' | 'all';
    };
    cacheSettings: {
        maxDisplayNameEntries: number;
        maxLinkEntries: number;
        maxDecorationEntries: number;
        expiryTime: number;
    };
    debugMode: boolean;
}

export interface ITitleExtractorPlugin extends Plugin {
    settings: TitleExtractorSettings;
    saveSettings(): Promise<void>;
    updateAllFilesDisplay(): void;
    registerEditorExtension(extension: Extension[]): void;
    
    // 添加服务组件引用
    linkStateManager: ILinkStateManager;
    extensionCacheService: ExtensionCacheService;
    
    // 新增：诊断和性能监控服务引用
    diagnosticService?: any;
    performanceMonitor?: any;
    errorHandler?: any;
    
    // 内部使用的属性，用于存储链接装饰器引用
    _linkDecorator?: any;
}

export interface FileDisplayResult {
    success: boolean;
    displayName: string;
    error?: string;
    fromCache?: boolean;
}

export interface FileCacheWithFrontmatter {
    frontmatter?: {
        [key: string]: any;
        title?: string;
    };
} 