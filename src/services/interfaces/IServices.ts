import { TFile, TAbstractFile } from 'obsidian';
import { FileDisplayResult } from '../../types';
import { Extension } from '@codemirror/state';
import { IErrorHandler } from './IErrorHandler';
import { FileEventType, EventCallback, FileEvent } from '../EventManagerService';

// 导出错误处理服务接口
export type { IErrorHandler };

// 日志服务接口
export interface ILoggerService {
    log(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    getLogger(prefix: string): ILoggerService;
    dispose(): void;
}

// 文件名解析服务接口
export interface IFilenameParser {
    parseFilename(file: TFile): Promise<FileDisplayResult>;
    shouldProcess(file: TFile): boolean;
    isFileInEnabledFolder(file: TFile): boolean;
    getDisplayNameFromMetadata(file: TFile): FileDisplayResult;
    dispose(): void;
}

// 文件显示缓存服务接口
export interface IFileDisplayCache {
    get(path: string): FileDisplayResult | undefined;
    set(path: string, result: FileDisplayResult): void;
    deletePath(path: string): void;
    clear(): void;
    stopPeriodicCleanup(): void;
    
    // 为FileExplorerDisplayService增加的方法
    getDisplayName(path: string): string | undefined;
    setDisplayName(path: string, displayName: string): void;
    hasDisplayName(path: string): boolean;
    saveOriginalName(path: string, originalName: string): void;
    getOriginalName(path: string): string | undefined;
    saveElementData(element: HTMLElement, path: string, originalName: string): void;
    getElementData(element: HTMLElement): { path: string; originalName: string } | undefined;
    getAllOriginalNames(): Map<string, string>;
    clearAll(): void;
    dispose(): void;
}

// 文件浏览器显示服务接口
export interface IFileExplorerDisplayService {
    setupObservers(): void;
    resetObservers(): void;
    updateFileExplorerDisplay(file: TFile): Promise<void>;
    updateAddedNodes(nodes: Node[]): void;
    restoreAllDisplayNames(): void;
    dispose(): void;
}

// 文件处理服务接口
export interface IFileProcessorService {
    processFile(file: TFile): Promise<FileDisplayResult | undefined> | FileDisplayResult;
    updateAllFilesDisplay(clearCache?: boolean): void;
    separateFilesByVisibility(files: TFile[]): { visibleFiles: TFile[], otherFiles: TFile[] };
    getBatchProcessor(): any;
    dispose(): void;
}

// Markdown链接服务接口
export interface IMarkdownLinkService {
    updateMarkdownLinksForFile(file: TFile): void;
    dispose(): void;
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
    subscribe(eventType: FileEventType, callback: EventCallback): () => void;
    unsubscribe(eventType: FileEventType, callback: EventCallback): void;
    dispatch(event: FileEvent): Promise<void>;
    dispose(): void;
}

// 定时器服务接口
export interface ITimerService {
    setTimeout(callback: () => void, delay: number): number;
    setInterval(callback: () => void, delay: number): number;
    clearTimeout(id: number): void;
    clearInterval(id: number): void;
    requestIdleCallback(callback: () => void): number;
    cancelIdleCallback(id: number): void;
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