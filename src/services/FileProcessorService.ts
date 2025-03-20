import { TFile, MarkdownView, WorkspaceLeaf } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';
import { IFileProcessorService, ITimerService, ILoggerService } from './interfaces/IServices';

export class FileProcessorService implements IFileProcessorService {
    private plugin: ITitleExtractorPlugin;
    private filenameParser: FilenameParser;
    private fileDisplayCache: FileDisplayCache;
    private timerService: ITimerService;
    private logger: ILoggerService;
    private processQueue: Array<{file: TFile; priority: boolean}> = [];
    private processingBatch = false;
    private batchSize = 50;
    
    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: FileDisplayCache,
        timerService: ITimerService,
        loggerService: ILoggerService,
        private updateFileDisplayFn: (file: TFile) => Promise<void>
    ) {
        this.plugin = plugin;
        this.filenameParser = filenameParser;
        this.fileDisplayCache = fileDisplayCache;
        this.timerService = timerService;
        this.logger = loggerService.getLogger('FileProcessorService');
        this.logger.debug('FileProcessorService已初始化');
    }
    
    // 处理单个文件并返回处理结果
    public processFile(file: TFile): FileDisplayResult {
        // 检查文件是否在启用的文件夹中
        if (!this.filenameParser.isFileInEnabledFolder(file)) {
            return {
                success: false,
                error: '文件不在启用的文件夹中',
                displayName: file.basename
            };
        }

        // 检查缓存
        if (this.fileDisplayCache.hasDisplayName(file.path)) {
            const cachedName = this.fileDisplayCache.getDisplayName(file.path);
            if (cachedName) {
                return {
                    success: true,
                    displayName: cachedName,
                    fromCache: true
                };
            }
        }

        // 使用metadataCache获取文件元数据，处理文件名
        const result = this.filenameParser.getDisplayNameFromMetadata(file);
        if (result.success && result.displayName) {
            this.fileDisplayCache.setDisplayName(file.path, result.displayName);
        }
        return result;
    }
    
    // 更新所有文件显示
    public updateAllFilesDisplay(clearCache = true): void {
        // 根据参数决定是清除所有缓存还是只清除过期缓存
        if (clearCache) {
            this.fileDisplayCache.clearAll();
        } else {
            this.fileDisplayCache.clearExpired();
        }

        // 获取所有启用目录中的文件
        const allEligibleFiles = this.plugin.app.vault.getMarkdownFiles()
            .filter(file => this.filenameParser.isFileInEnabledFolder(file));
        
        if (allEligibleFiles.length === 0) return;

        // 分离可见文件和其他文件
        const { visibleFiles, otherFiles } = this.separateFilesByVisibility(allEligibleFiles);
        
        // 先处理可见文件
        if (visibleFiles.length > 0) {
            this.addToProcessQueue(visibleFiles, true); // 高优先级
        }
        
        // 然后处理其他文件
        if (otherFiles.length > 0) {
            this.addToProcessQueue(otherFiles, false); // 低优先级
        }
    }
    
    // 将文件分为可见文件和其他文件
    public separateFilesByVisibility(files: TFile[]): { visibleFiles: TFile[], otherFiles: TFile[] } {
        // 获取当前所有可见的文件
        const visibleFiles = new Set<string>();
        
        // 添加当前活动编辑器中的文件
        const activeFile = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (activeFile) {
            visibleFiles.add(activeFile.path);
        }
        
        // 添加所有当前打开的标签页中的文件
        this.plugin.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
            // 安全地获取文件
            const fileFromView = leaf.view instanceof MarkdownView ? leaf.view.file : null;
            if (fileFromView instanceof TFile) {
                visibleFiles.add(fileFromView.path);
            }
        });
        
        // 分离文件
        const visible: TFile[] = [];
        const others: TFile[] = [];
        
        for (const file of files) {
            if (visibleFiles.has(file.path)) {
                visible.push(file);
            } else {
                others.push(file);
            }
        }
        
        return { visibleFiles: visible, otherFiles: others };
    }
    
    // 获取可见文件（原方法，保留以兼容性）
    private getVisibleFiles(): TFile[] {
        // 获取用户可见的文件
        const openFiles = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file 
            ? [this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file] 
            : [];
        
        // 获取当前打开文件夹中的所有文件
        const explorerFiles = this.plugin.app.vault.getMarkdownFiles();
        
        // 返回所有可见文件的唯一集合
        const uniqueFiles = Array.from(new Set([
            ...openFiles.filter((file): file is TFile => file instanceof TFile), 
            ...explorerFiles
        ]));
        return uniqueFiles;
    }
    
    // 添加文件到处理队列
    public addToProcessQueue(files: TFile[], highPriority: boolean = false): void {
        const queueItems = files.map(file => ({ file, priority: highPriority }));
        this.processQueue.push(...queueItems);
        
        if (!this.processingBatch) {
            this.processBatch();
        }
    }
    
    // 处理批次
    private async processBatch(): Promise<void> {
        if (this.processQueue.length === 0) {
            this.processingBatch = false;
            return;
        }

        this.processingBatch = true;
        
        // 对队列进行排序，高优先级的项目排在前面
        this.processQueue.sort((a, b) => {
            if (a.priority === b.priority) return 0;
            return a.priority ? -1 : 1;
        });
        
        // 取出前 batchSize 个项目处理
        const batchItems = this.processQueue.splice(0, this.batchSize);
        const batch = batchItems.map(item => item.file);

        // 使用TimerService的requestIdleCallback
        this.timerService.requestIdleCallback(() => {
            this.processBatchItems(batch);
        });
    }
    
    // 处理批次中的项目
    private async processBatchItems(files: TFile[]): Promise<void> {
        for (const file of files) {
            await this.updateFileDisplayFn(file);
        }
        
        if (this.processQueue.length > 0) {
            this.processBatch();
        } else {
            this.processingBatch = false;
        }
    }

    // 获取当前处理队列的状态
    public getQueueStatus(): { queueLength: number; isProcessing: boolean } {
        return {
            queueLength: this.processQueue.length,
            isProcessing: this.processingBatch
        };
    }
    
    /**
     * 释放资源
     */
    public dispose(): void {
        // 清空处理队列
        this.processQueue = [];
        this.processingBatch = false;
        
        // 解除引用
        (this as any).plugin = null;
        (this as any).filenameParser = null;
        (this as any).fileDisplayCache = null;
        (this as any).timerService = null;
        (this as any).updateFileDisplayFn = null;
        
        this.logger.debug('FileProcessorService资源已释放');
    }
} 