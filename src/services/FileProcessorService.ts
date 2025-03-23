import { TFile, MarkdownView, WorkspaceLeaf } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { 
    IFileProcessorService, 
    ITimerService, 
    ILoggerService, 
    IFileDisplayCache,
    IPerformanceMonitor,
    IErrorHandler
} from './interfaces/IServices';
import { BaseFileProcessor } from '../core/BaseFileProcessor';
import { BatchProcessorService, BatchProcessingOptions } from './BatchProcessorService';
import { FileNameIndexService } from './file/FileNameIndexService';
import { ErrorType, ErrorSeverity } from './ErrorHandler';

export class FileProcessorService extends BaseFileProcessor implements IFileProcessorService {
    private timerService: ITimerService;
    private performanceMonitor: IPerformanceMonitor;
    private errorHandler: IErrorHandler;
    private batchProcessor: BatchProcessorService<TFile>;
    private fileNameIndexService: FileNameIndexService;
    private updateFileDisplayFn: ((file: TFile) => Promise<void>) | null = null;
    
    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: IFileDisplayCache | undefined,
        loggerService: ILoggerService,
        timerService: ITimerService,
        performanceMonitor: IPerformanceMonitor,
        errorHandler: IErrorHandler
    ) {
        super(
            plugin, 
            filenameParser, 
            fileDisplayCache,
            loggerService
        );
        
        this.timerService = timerService;
        this.performanceMonitor = performanceMonitor;
        this.errorHandler = errorHandler;
        
        // 创建文件名索引服务
        this.fileNameIndexService = new FileNameIndexService(
            plugin,
            fileDisplayCache || null,
            filenameParser,
            loggerService
        );
        
        // 设置批处理选项
        const batchOptions: Partial<BatchProcessingOptions> = {
            batchSize: 20,
            targetProcessingTime: 50,
            useIdleCallback: true,
            useDynamicBatchSize: true
        };
        
        // 创建批处理服务
        this.batchProcessor = new BatchProcessorService<TFile>(
            async (files) => this.processBatchItems(files),
            loggerService,
            timerService,
            batchOptions
        );
        
        this.logger.debug('FileProcessorService已初始化');
    }
    
    /**
     * 初始化服务
     */
    public async initialize(): Promise<void> {
        // 初始化文件名索引
        await this.fileNameIndexService.initialize();
    }
    
    /**
     * 设置文件显示缓存
     * @param fileDisplayCache 文件显示缓存
     */
    public setFileDisplayCache(fileDisplayCache: IFileDisplayCache): void {
        // 调用基类方法
        super.setFileDisplayCache(fileDisplayCache);
    }
    
    /**
     * 设置文件显示更新函数
     * @param fn 更新函数
     */
    public setUpdateFileDisplayFn(fn: (file: TFile) => Promise<void>): void {
        this.updateFileDisplayFn = fn;
    }
    
    /**
     * 更新所有文件显示
     */
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
    
    /**
     * 将文件分为可见文件和其他文件
     */
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
    
    /**
     * 根据优先级分类文件
     * 将文件分为高、中、低三个优先级组
     */
    private prioritizeFiles(files: TFile[]): { highPriority: TFile[], normalPriority: TFile[], lowPriority: TFile[] } {
        const highPriority: TFile[] = [];
        const normalPriority: TFile[] = [];
        const lowPriority: TFile[] = [];
        
        for (const file of files) {
            const priority = this.filenameParser.getFilePriority(file);
            
            if (priority === 2) {
                highPriority.push(file);
            } else if (priority === 1) {
                normalPriority.push(file);
            } else {
                lowPriority.push(file);
            }
        }
        
        this.logger.debug(`文件优先级分组: 高=${highPriority.length}，中=${normalPriority.length}，低=${lowPriority.length}`);
        
        return { highPriority, normalPriority, lowPriority };
    }
    
    /**
     * 添加文件到处理队列
     */
    public addToProcessQueue(files: TFile[], highPriority: boolean = false): void {
        // 如果启用了文件优先级功能且有文件
        if (files.length > 0) {
            // 先按优先级分组
            const { highPriority, normalPriority, lowPriority } = this.prioritizeFiles(files);
            
            // 按不同优先级加入队列
            // 预置优先级（highPriority参数）会提升所有文件的基础优先级
            const basePriority = highPriority ? 10 : 0;
            
            // 将文件按不同优先级加入队列
            if (highPriority.length > 0) {
                this.batchProcessor.add(highPriority, basePriority + 10); // 高优先级文件
            }
            
            if (normalPriority.length > 0) {
                this.batchProcessor.add(normalPriority, basePriority + 5); // 中优先级文件
            }
            
            if (lowPriority.length > 0) {
                this.batchProcessor.add(lowPriority, basePriority); // 低优先级文件
            }
        }
    }
    
    /**
     * 处理批次中的项目
     */
    private async processBatchItems(files: TFile[]): Promise<void> {
        const processingPromises = files.map(file => this.processFileWithMonitoring(file));
        await Promise.all(processingPromises);
    }
    
    /**
     * 使用性能监控和错误处理处理文件
     */
    private async processFileWithMonitoring(file: TFile): Promise<void> {
        try {
            // 使用性能监控包装处理逻辑
            const wrappedProcess = this.performanceMonitor.measureAsync(
                'processFile',
                async () => this.processFileAsync(file)
            );
            
            const result = await wrappedProcess();
            
            // 如果有更新函数并且处理成功，调用更新
            if (this.updateFileDisplayFn && result.success) {
                await this.updateFileDisplayFn(file);
            }
        } catch (error) {
            // 使用错误处理器处理异常
            this.errorHandler.handleError(
                'FileProcessorService',
                error instanceof Error ? error : new Error(String(error)),
                ErrorType.FILE,
                ErrorSeverity.MEDIUM,
                () => {
                    // 恢复逻辑：将文件重新加入队列（低优先级）
                    this.addToProcessQueue([file], false);
                }
            );
        }
    }
    
    /**
     * 异步处理文件（内部使用）
     */
    private async processFileAsync(file: TFile): Promise<FileDisplayResult> {
        // 使用基类的方法处理文件
        const baseResult = super.processFile(file);
        
        // 更新文件名索引
        if (baseResult.success) {
            this.fileNameIndexService.addFilesToQueue([file], true);
        }
        
        return baseResult;
    }
    
    /**
     * 获取文件显示名称（异步方法）
     */
    public async getFileDisplayName(path: string): Promise<string> {
        return this.fileNameIndexService.getDisplayName(path);
    }
    
    /**
     * 批量获取文件显示名称
     */
    public async batchGetDisplayNames(paths: string[]): Promise<Map<string, string>> {
        return this.fileNameIndexService.batchGetDisplayNames(paths);
    }

    /**
     * 获取当前处理队列的状态
     */
    public getQueueStatus(): { queueLength: number; isProcessing: boolean } {
        const stats = this.batchProcessor.getStats();
        return {
            queueLength: stats.queueSize,
            isProcessing: stats.isProcessing
        };
    }
    
    /**
     * 获取处理统计信息
     */
    public getProcessingStats(): {
        queueSize: number;
        processedItems: number;
        isProcessing: boolean;
        averageProcessingTime: number;
    } {
        const stats = this.batchProcessor.getStats();
        return {
            queueSize: stats.queueSize,
            processedItems: stats.processedItems,
            isProcessing: stats.isProcessing,
            averageProcessingTime: stats.averageProcessingTime
        };
    }
    
    /**
     * 暂停处理
     */
    public pause(): void {
        this.batchProcessor.pause();
    }
    
    /**
     * 恢复处理
     */
    public resume(): void {
        this.batchProcessor.resume();
    }
    
    /**
     * 释放资源
     */
    public dispose(): void {
        // 清空处理队列
        this.batchProcessor.dispose();
        
        // 清理文件名索引服务
        this.fileNameIndexService.dispose();
        
        // 清除引用
        this.updateFileDisplayFn = null;
        
        this.logger.debug('FileProcessorService资源已释放');
    }
} 