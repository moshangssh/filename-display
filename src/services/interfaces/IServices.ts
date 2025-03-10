import { TFile, TAbstractFile } from 'obsidian';
import { FileDisplayResult } from '../../types';
import { Extension } from '@codemirror/state';
import { IErrorHandler } from './IErrorHandler';

// 导出错误处理服务接口
export type { IErrorHandler };

// 文件名解析服务接口
export interface IFilenameParser {
    parseFilename(file: TFile): Promise<FileDisplayResult>;
    shouldProcess(file: TFile): boolean;
}

// 文件显示缓存服务接口
export interface IFileDisplayCache {
    get(path: string): FileDisplayResult | undefined;
    set(path: string, result: FileDisplayResult): void;
    deletePath(path: string): void;
    clear(): void;
    stopPeriodicCleanup(): void;
}

// 文件浏览器显示服务接口
export interface IFileExplorerDisplayService {
    setupObservers(): void;
    resetObservers(): void;
    updateFileExplorerDisplay(file: TFile): Promise<void>;
    updateAddedNodes(nodes: Node[]): void;
    restoreAllDisplayNames(): void;
}

// 文件处理服务接口
export interface IFileProcessorService {
    processFile(file: TFile): Promise<FileDisplayResult | undefined> | FileDisplayResult;
    updateAllFilesDisplay(clearCache?: boolean): void;
    separateFilesByVisibility(files: TFile[]): { visibleFiles: TFile[], otherFiles: TFile[] };
    getBatchProcessor(): any;
}

// Markdown链接服务接口
export interface IMarkdownLinkService {
    updateMarkdownLinksForFile(file: TFile): void;
}

// 编辑器链接装饰器接口
export interface IEditorLinkDecorator {
    processLinks(): void;
    dispose(): void;
    getExtension(): Extension[];
}

// 事件管理服务接口
export interface IEventManagerService {
    setupVaultEventListeners(): void;
    setupMetadataEventListeners(): void;
    dispose(): void;
}

// 定时器服务接口
export interface ITimerService {
    setTimeout(callback: () => void, delay: number): number;
    setInterval(callback: () => void, delay: number): number;
    clearTimeout(id: number): void;
    clearInterval(id: number): void;
    clearAll(): void;
    dispose(): void;
}

// 主文件显示服务接口
export interface IFileDisplayService {
    updateFileExplorerDisplay(file: TFile): Promise<void>;
    updateAllFilesDisplay(clearCache?: boolean): void;
    restoreAllDisplayNames(): void;
    resetObservers(): void;
    getCache(): IFileDisplayCache;
    dispose(): void;
} 