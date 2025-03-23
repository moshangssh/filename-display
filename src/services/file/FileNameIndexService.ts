import { TFile, normalizePath } from 'obsidian';
import { ITitleExtractorPlugin, FileDisplayResult } from '../../types';
import { ILoggerService, IFilenameParser, IFileDisplayCache } from '../interfaces/IServices';

/**
 * 文件名索引条目
 */
interface FileIndexEntry {
    path: string;           // 文件路径
    basename: string;       // 文件基本名称
    displayName: string;    // 显示名称
    mtime: number;          // 文件修改时间
    indexed: number;        // 索引时间戳
    priority: number;       // 优先级 (用于排序)
}

/**
 * 文件名索引服务
 * 管理和索引文件名，提供高效的文件名查询能力
 */
export class FileNameIndexService {
    private plugin: ITitleExtractorPlugin;
    private fileDisplayCache: IFileDisplayCache;
    private filenameParser: IFilenameParser;
    private logger: ILoggerService;
    
    // 文件索引
    private fileIndex: Map<string, FileIndexEntry> = new Map();
    
    // 最近访问的文件
    private recentAccessQueue: string[] = [];
    private maxRecentFiles = 50;
    
    // 处理队列
    private processingQueue: string[] = [];
    private isProcessing = false;
    private batchSize = 20;

    constructor(
        plugin: ITitleExtractorPlugin,
        fileDisplayCache: IFileDisplayCache | null,
        filenameParser: IFilenameParser,
        loggerService: ILoggerService
    ) {
        this.plugin = plugin;
        this.fileDisplayCache = fileDisplayCache || this.createDummyCache();
        this.filenameParser = filenameParser;
        this.logger = loggerService.getLogger('FileNameIndexService');
        this.logger.debug('FileNameIndexService 初始化完成');
    }

    /**
     * 创建一个临时的、空的缓存对象
     * 在实际缓存未就绪时使用
     */
    private createDummyCache(): IFileDisplayCache {
        return {
            get: () => undefined,
            set: () => {},
            deletePath: () => {},
            clear: () => {},
            stopPeriodicCleanup: () => {},
            warmUpCache: async () => {},
            isWarmingUp: () => false,
            cancelWarmupCache: () => {},
            preloadLinkedFiles: () => {},
            addFileLink: () => {},
            getDisplayName: () => undefined,
            setDisplayName: () => {},
            hasDisplayName: () => false,
            saveOriginalName: () => {},
            getOriginalName: () => undefined,
            saveElementData: () => {},
            getElementData: () => undefined,
            getAllOriginalNames: () => new Map(),
            clearAll: () => {},
            isCacheValid: () => false,
            setCacheCleanStrategy: () => {},
            getCacheCleanStrategy: () => 0,
            triggerCleanup: () => {},
            dispose: () => {}
        };
    }

    /**
     * 初始化索引
     */
    public async initialize(): Promise<void> {
        this.logger.debug('开始初始化文件索引');
        
        // 获取所有启用文件夹中的markdown文件
        const files = this.plugin.app.vault.getMarkdownFiles().filter(
            file => this.filenameParser.isFileInEnabledFolder(file)
        );
        
        this.logger.info(`发现 ${files.length} 个文件需要索引`);
        
        // 添加到处理队列
        this.addFilesToQueue(files);
    }

    /**
     * 添加文件到处理队列
     */
    public addFilesToQueue(files: TFile[], highPriority = false): void {
        const paths = files.map(file => file.path);
        
        if (highPriority) {
            // 高优先级文件添加到队列前端
            this.processingQueue.unshift(...paths);
        } else {
            // 普通优先级文件添加到队列末尾
            this.processingQueue.push(...paths);
        }
        
        if (!this.isProcessing) {
            this.processNextBatch();
        }
    }

    /**
     * 处理下一批文件
     */
    private async processNextBatch(): Promise<void> {
        if (this.processingQueue.length === 0) {
            this.isProcessing = false;
            this.logger.debug('文件索引队列处理完成');
            return;
        }

        this.isProcessing = true;
        
        // 取出一批文件处理
        const batch = this.processingQueue.splice(0, this.batchSize);
        
        // 处理这批文件
        await this.processBatch(batch);
        
        // 在下一个微任务中处理下一批，避免阻塞UI
        setTimeout(() => this.processNextBatch(), 10);
    }

    /**
     * 处理一批文件
     */
    private async processBatch(filePaths: string[]): Promise<void> {
        const startTime = performance.now();
        
        for (const path of filePaths) {
            await this.indexFile(path);
        }
        
        const elapsed = performance.now() - startTime;
        this.logger.debug(`批量处理 ${filePaths.length} 个文件耗时 ${elapsed.toFixed(2)}ms`);
        
        // 动态调整批处理大小
        this.adjustBatchSize(elapsed, filePaths.length);
    }

    /**
     * 动态调整批处理大小以优化性能
     */
    private adjustBatchSize(elapsedMs: number, batchSize: number): void {
        // 目标处理时间 (毫秒)
        const targetMs = 50;
        
        if (elapsedMs > targetMs * 1.5 && this.batchSize > 10) {
            // 如果处理时间过长，减小批处理大小
            this.batchSize = Math.max(5, Math.floor(this.batchSize * 0.8));
        } else if (elapsedMs < targetMs * 0.5 && this.batchSize < 100) {
            // 如果处理时间很短，增加批处理大小
            this.batchSize = Math.min(100, Math.floor(this.batchSize * 1.2));
        }
    }

    /**
     * 索引单个文件
     */
    private async indexFile(path: string): Promise<void> {
        try {
            const normalizedPath = normalizePath(path);
            const file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
            
            if (!(file instanceof TFile)) {
                this.logger.warn(`无法索引文件 ${path}，文件不存在或不是TFile`);
                return;
            }
            
            // 检查文件是否在启用的文件夹中
            if (!this.filenameParser.isFileInEnabledFolder(file)) {
                return;
            }
            
            // 从缓存获取结果
            let displayName: string | undefined;
            if (this.fileDisplayCache.isCacheValid(file.path, file)) {
                displayName = this.fileDisplayCache.getDisplayName(file.path);
            }
            
            // 如果缓存中没有，获取新的显示名称
            if (!displayName) {
                const result = this.filenameParser.getDisplayNameFromMetadata(file);
                if (result.success && result.displayName) {
                    displayName = result.displayName;
                    this.fileDisplayCache.setDisplayName(file.path, displayName);
                } else {
                    displayName = file.basename;
                }
            }
            
            // 更新索引
            this.fileIndex.set(normalizedPath, {
                path: normalizedPath,
                basename: file.basename,
                displayName: displayName,
                mtime: file.stat.mtime,
                indexed: Date.now(),
                priority: this.getPriority(file)
            });
            
        } catch (error) {
            this.logger.error(`索引文件 ${path} 时出错:`, error);
        }
    }

    /**
     * 获取文件处理优先级
     */
    private getPriority(file: TFile): number {
        // 计算优先级，以下因素会增加优先级：
        // 1. 最近访问的文件
        // 2. 当前打开的文件
        let priority = 0;
        
        // 检查是否在最近访问列表中
        const recentIndex = this.recentAccessQueue.indexOf(file.path);
        if (recentIndex >= 0) {
            // 最近访问的文件有更高优先级
            priority += (this.recentAccessQueue.length - recentIndex);
        }
        
        // 检查是否是当前活动文件
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (activeFile && activeFile.path === file.path) {
            priority += 1000; // 当前活动文件有最高优先级
        }
        
        return priority;
    }

    /**
     * 获取文件的显示名称
     */
    public async getDisplayName(path: string): Promise<string> {
        // 如果传入 undefined 或空字符串，直接返回
        if (!path) return '';
        
        const normalizedPath = normalizePath(path);
        
        // 记录文件访问
        this.recordFileAccess(normalizedPath);
        
        // 检查索引中是否有缓存
        const indexEntry = this.fileIndex.get(normalizedPath);
        if (indexEntry) {
            // 检查文件是否被修改
            const file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
            if (file instanceof TFile && file.stat.mtime <= indexEntry.mtime) {
                return indexEntry.displayName;
            }
        }
        
        // 索引文件并返回结果
        await this.indexFile(normalizedPath);
        const updatedEntry = this.fileIndex.get(normalizedPath);
        return updatedEntry ? updatedEntry.displayName : path.split('/').pop() || path;
    }
    
    /**
     * 批量获取显示名称
     */
    public async batchGetDisplayNames(paths: string[]): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        const toProcess: string[] = [];
        
        // 先检查索引中已有的条目
        for (const path of paths) {
            if (!path) continue;
            
            const normalizedPath = normalizePath(path);
            this.recordFileAccess(normalizedPath);
            
            const indexEntry = this.fileIndex.get(normalizedPath);
            if (indexEntry) {
                // 检查文件是否被修改
                const file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
                if (file instanceof TFile && file.stat.mtime <= indexEntry.mtime) {
                    result.set(normalizedPath, indexEntry.displayName);
                    continue;
                }
            }
            
            // 需要处理的文件
            toProcess.push(normalizedPath);
        }
        
        // 批量处理剩余文件
        if (toProcess.length > 0) {
            await Promise.all(toProcess.map(path => this.indexFile(path)));
            
            // 获取处理后的结果
            for (const path of toProcess) {
                const entry = this.fileIndex.get(path);
                if (entry) {
                    result.set(path, entry.displayName);
                } else {
                    result.set(path, path.split('/').pop() || path);
                }
            }
        }
        
        return result;
    }
    
    /**
     * 记录文件访问，用于优先级计算
     */
    private recordFileAccess(path: string): void {
        // 从队列中移除已存在的条目
        const index = this.recentAccessQueue.indexOf(path);
        if (index >= 0) {
            this.recentAccessQueue.splice(index, 1);
        }
        
        // 添加到队列头部
        this.recentAccessQueue.unshift(path);
        
        // 保持队列大小
        if (this.recentAccessQueue.length > this.maxRecentFiles) {
            this.recentAccessQueue.pop();
        }
    }

    /**
     * 删除文件的索引
     */
    public removeFileFromIndex(path: string): void {
        const normalizedPath = normalizePath(path);
        this.fileIndex.delete(normalizedPath);
        
        // 从最近访问队列中移除
        const index = this.recentAccessQueue.indexOf(normalizedPath);
        if (index >= 0) {
            this.recentAccessQueue.splice(index, 1);
        }
    }

    /**
     * 清空索引
     */
    public clearIndex(): void {
        this.fileIndex.clear();
        this.recentAccessQueue = [];
        this.processingQueue = [];
        this.isProcessing = false;
    }

    /**
     * 获取索引统计信息
     */
    public getStats(): {
        totalFiles: number;
        queueLength: number;
        isProcessing: boolean;
        batchSize: number;
    } {
        return {
            totalFiles: this.fileIndex.size,
            queueLength: this.processingQueue.length,
            isProcessing: this.isProcessing,
            batchSize: this.batchSize
        };
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        this.clearIndex();
        this.logger.debug('FileNameIndexService 资源已释放');
    }
} 