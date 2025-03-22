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
}

export interface ITitleExtractorPlugin extends Plugin {
    settings: TitleExtractorSettings;
    saveSettings(): Promise<void>;
    updateAllFilesDisplay(): void;
    registerEditorExtension(extension: Extension[]): void;
    
    // 添加服务组件引用
    linkStateManager: ILinkStateManager;
    extensionCacheService: ExtensionCacheService;
    
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