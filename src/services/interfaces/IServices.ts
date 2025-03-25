import { TFile, TAbstractFile } from 'obsidian';
import { FileDisplayResult } from '../../types';
import { Extension } from '@codemirror/state';
import { FileEventType, EventCallback, FileEvent } from '../EventManagerService';
import { EditorView } from '@codemirror/view';
import { LinkBatchCallback, LinkInfo, LinkUpdateResult } from '../LinkStateManager';
import { ErrorRecord, ErrorSeverity, ErrorType } from '../ErrorHandler';
import { PerformanceReport } from '../PerformanceMonitor';
import { CacheEntry } from '../cache/CacheManager';

// 缓存清理策略枚举
export enum CacheCleanStrategy {
    LRU,        // 最近最少使用
    FIFO,       // 先进先出
    PRIORITY    // 优先级策略
}

// 日志服务接口
export interface ILoggerService {
    isDebugEnabled(): boolean;
    log(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    getLogger(prefix: string): ILoggerService;
    dispose(): void;
}

// 中心化缓存管理服务接口
export interface ICacheManager {
    // 显示名称缓存方法
    setDisplayName(path: string, displayName: string, originalName: string, mtime: number): void;
    getDisplayName(path: string): string | undefined;
    getOriginalName(path: string): string | undefined;
    isCacheValid(path: string, file: TFile): boolean;
    
    // 链接缓存方法
    setCachedLink(sourcePath: string, targetPath: string, displayName: string): void;
    getCachedLink(sourcePath: string, targetPath: string): string | undefined;
    updateLinkMTime(targetPath: string, mtime: number): void;
    
    // 编辑器装饰缓存方法
    setDecorationCache(editorId: string, linkId: string, from: number, to: number, displayText: string): void;
    getDecorationCache(editorId: string, linkId: string): { from: number, to: number, displayText: string } | undefined;
    
    // 缓存管理方法
    clearFileCache(path: string): void;
    cleanupCache(maxDisplayNameEntries?: number, maxLinkEntries?: number, maxDecorationEntries?: number): void;
    clearAll(): void;
    getStats(): { displayNameSize: number, linkSize: number, decorationSize: number };
}

// 性能监控服务接口
export interface IPerformanceMonitor {
    enable(autoReportThreshold?: number): void;
    disable(): void;
    startMeasure(id: string): () => void;
    measure<T extends any[], R>(id: string, fn: (...args: T) => R): (...args: T) => R;
    measureAsync<T extends any[], R>(id: string, fn: (...args: T) => Promise<R>): (...args: T) => Promise<R>;
    getReport(): PerformanceReport;
    getMetric(id: string): { avg: number, max: number, min: number, count: number, lastValue: number } | undefined;
    logReport(): void;
    reset(): void;
    dispose(): void;
}

// 错误处理服务接口
export interface IErrorHandler {
    handleError(
        component: string, 
        error: Error | string, 
        type?: ErrorType,
        severity?: ErrorSeverity,
        recoveryFn?: () => void
    ): boolean;
    getErrorCount(component: string): number;
    isComponentInErrorState(component: string): boolean;
    resetComponentErrorCount(component: string): void;
    getErrorHistory(): ErrorRecord[];
    getErrorSummaryByComponent(): Record<string, { count: number, lastError: string, severity: ErrorSeverity }>;
    getErrorStats(): { total: number, byType: Record<ErrorType, number>, byComponent: Record<string, number> };
    clearAll(): void;
    wrapWithErrorHandler<T extends any[], R>(
        component: string,
        fn: (...args: T) => R,
        type?: ErrorType,
        severity?: ErrorSeverity,
        recoveryFn?: () => void
    ): (...args: T) => R | undefined;
    wrapAsyncWithErrorHandler<T extends any[], R>(
        component: string,
        fn: (...args: T) => Promise<R>,
        type?: ErrorType,
        severity?: ErrorSeverity,
        recoveryFn?: () => void
    ): (...args: T) => Promise<R | undefined>;
}

// 文件名解析服务接口
export interface IFilenameParser {
    parseFilename(file: TFile): Promise<FileDisplayResult>;
    shouldProcess(file: TFile): boolean;
    isFileInEnabledFolder(file: TFile): boolean;
    getDisplayNameFromMetadata(file: TFile): FileDisplayResult;
    extractDisplayName(filename: string): FileDisplayResult;
    getFilePriority(file: TFile): number;
    dispose(): void;
}

// 文件显示缓存服务接口
export interface IFileDisplayCache {
    get(path: string): FileDisplayResult | undefined;
    set(path: string, result: FileDisplayResult): void;
    deletePath(path: string): void;
    clear(): void;
    stopPeriodicCleanup(): void;
    
    // 缓存预热相关方法
    warmUpCache(): Promise<void>;
    isWarmingUp(): boolean;
    cancelWarmupCache(): void;
    preloadLinkedFiles(path: string): void;
    addFileLink(sourcePath: string, targetPath: string): void;
    
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
    
    // 缓存验证相关方法
    isCacheValid(path: string, file: TFile): boolean;
    
    // 缓存清理策略相关方法
    setCacheCleanStrategy(strategy: CacheCleanStrategy): void;
    getCacheCleanStrategy(): CacheCleanStrategy;
    triggerCleanup(): void;
    
    dispose(): void;
}

// 链接状态管理接口
export interface ILinkStateManager {
    updateLinkText(view: EditorView, id: string, newText: string): LinkUpdateResult;
    updateLinkDisplayName(view: EditorView, from: number, to: number, displayName: string): LinkUpdateResult;
    processBatch(view: EditorView, links: LinkInfo[], callback: LinkBatchCallback): void;
    clearDecorations(view: EditorView): void;
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
    processFileWrapper(file: TFile): Promise<FileDisplayResult>;
    updateAllFilesDisplay(clearCache?: boolean): void;
    separateFilesByVisibility(files: TFile[]): { visibleFiles: TFile[], otherFiles: TFile[] };
    addToProcessQueue(files: TFile[], highPriority?: boolean): void;
    getQueueStatus(): { queueLength: number; isProcessing: boolean };
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
    updateActiveView(): void;
    collectLinks(): void;
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