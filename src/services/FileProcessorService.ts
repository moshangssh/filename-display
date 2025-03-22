import { TFile, MarkdownView, WorkspaceLeaf } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { IFileProcessorService, ITimerService, ILoggerService, IFileDisplayCache } from './interfaces/IServices';
import { BaseFileProcessor } from '../core/BaseFileProcessor';

export class FileProcessorService extends BaseFileProcessor implements IFileProcessorService {
    private timerService: ITimerService | null = null;
    private processQueue: Array<{file: TFile; priority: boolean}> = [];
    private processingBatch = false;
    private batchSize = 50;
    private updateFileDisplayFn: ((file: TFile) => Promise<void>) | null = null;
    
    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: IFileDisplayCache | null,
        loggerService: ILoggerService
    ) {
        super(
            plugin, 
            filenameParser, 
            fileDisplayCache as IFileDisplayCache,
            loggerService
        );
        this.logger.debug('FileProcessorService已初始化');
    }
    
    /**
     * 设置定时器服务
     * @param timerService 定时器服务实例
     */
    public setTimerService(timerService: ITimerService): void {
        this.timerService = timerService;
    }
    
    /**
     * 设置文件显示缓存引用
     * @param cache 文件显示缓存实例
     */
    public setFileDisplayCache(cache: IFileDisplayCache): void {
        // @ts-ignore - 动态更新protected属性
        this.fileDisplayCache = cache;
    }
    
    /**
     * 设置文件显示更新函数
     * @param fn 更新函数
     */
    public setUpdateFileDisplayFn(fn: (file: TFile) => Promise<void>): void {
        this.updateFileDisplayFn = fn;
    }
    
    // 更新所有文件显示
    public updateAllFilesDisplay(clearCache = true): void {
        if (clearCache && this.fileDisplayCache) {
            this.fileDisplayCache.clear();
        }
        
        // 获取所有启用文件夹中的markdown文件
        const files = this.plugin.app.vault.getMarkdownFiles().filter(
            file => this.filenameParser.isFileInEnabledFolder(file)
        );
        
        // 先处理可见文件，再处理其他文件
        const { visibleFiles, otherFiles } = this.separateFilesByVisibility(files);
        
        // 加入处理队列
        this.addToProcessQueue(visibleFiles, true);
        this.addToProcessQueue(otherFiles, false);
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

        // 使用TimerService的requestIdleCallback，如果可用的话
        if (this.timerService) {
            this.timerService.requestIdleCallback(() => {
                this.processBatchItems(batch);
            });
        } else {
            // 退化方案：直接使用setTimeout
            setTimeout(() => {
                this.processBatchItems(batch);
            }, 0);
        }
    }
    
    // 处理批次中的项目
    private async processBatchItems(files: TFile[]): Promise<void> {
        for (const file of files) {
            try {
                const result = this.processFile(file);
                
                // 如果有更新函数并且处理成功，调用更新
                if (this.updateFileDisplayFn && result.success) {
                    await this.updateFileDisplayFn(file);
                }
            } catch (error) {
                this.logger.error(`处理文件 ${file.path} 时出错:`, error);
            }
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
        
        // 清除引用
        this.fileDisplayCache = null as any;
        this.updateFileDisplayFn = null;
        this.timerService = null;
        
        this.logger.debug('FileProcessorService资源已释放');
    }
} 