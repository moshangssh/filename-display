import { App, TFile, TFolder, normalizePath, Vault, CachedMetadata } from 'obsidian';

/**
 * 文件管理器配置接口
 */
export interface FileManagerConfig {
    batchSize: number;        // 批处理大小
    activeFolder: string;     // 激活的文件夹路径
}

/**
 * 文件缓存项接口
 */
interface FileCacheItem {
    files: TFile[];
    metadata: CachedMetadata;
    timestamp: number;
}

/**
 * 文件管理器类
 * 负责文件的批量检索、处理和缓存管理
 */
export class FileManager {
    private weakFileCache = new WeakMap<TFile, FileCacheItem>();
    private readonly CACHE_EXPIRE_TIME = 5 * 60 * 1000; // 5分钟过期

    constructor(
        private app: App,
        private config: FileManagerConfig
    ) {
        // 监听元数据缓存事件
        this.app.metadataCache.on('changed', this.handleMetadataChange.bind(this));
        this.app.vault.on('delete', this.handleFileDelete.bind(this));
    }

    /**
     * 处理元数据变更事件
     */
    private handleMetadataChange(file: TFile): void {
        const cacheItem = this.weakFileCache.get(file);
        if (cacheItem) {
            const metadata = this.app.metadataCache.getFileCache(file);
            if (metadata) {
                cacheItem.metadata = metadata;
                cacheItem.timestamp = Date.now();
            }
        }
    }

    /**
     * 处理文件删除事件
     */
    private handleFileDelete(file: TFile): void {
        // WeakMap会自动处理已删除文件的引用
        // 不需要手动清理
    }
    
    /**
     * 更新配置
     */
    public updateConfig(config: Partial<FileManagerConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 获取当前活动文件夹
     */
    public getActiveFolder(): TFolder | null {
        if (!this.config.activeFolder) {
            return null;
        }
        
        const normalizedPath = normalizePath(this.config.activeFolder);
        const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
        
        return folder instanceof TFolder ? folder : null;
    }
    
    /**
     * 异步生成器：遍历文件夹
     */
    private async *traverseFolder(folder: TFolder): AsyncGenerator<TFile, void, unknown> {
        const now = Date.now();
        let batch: TFile[] = [];
        
        for (const child of folder.children) {
            if (child instanceof TFile) {
                batch.push(child);
                const metadata = this.app.metadataCache.getFileCache(child);
                if (metadata) {
                    this.weakFileCache.set(child, {
                        files: [child],
                        metadata,
                        timestamp: now
                    });
                }
                
                if (batch.length >= this.config.batchSize) {
                    yield* batch;
                    batch = [];
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            } else if (child instanceof TFolder) {
                if (batch.length > 0) {
                    yield* batch;
                    batch = [];
                }
                yield* this.traverseFolder(child);
            }
        }
        
        if (batch.length > 0) {
            yield* batch;
        }
    }
    
    /**
     * 异步获取文件夹内所有文件
     * 使用WeakMap和MetadataCache优化性能
     */
    public async getAllFiles(folder: TFolder): Promise<TFile[]> {
        try {
            const files: TFile[] = [];
            
            // 使用异步生成器遍历文件
            for await (const file of this.traverseFolder(folder)) {
                files.push(file);
            }
            
            return files;
        } catch (error) {
            console.error('[Filename Display] 获取文件失败:', error);
            return [];
        }
    }
    
    /**
     * 通过路径获取文件
     */
    public getFileByPath(path: string): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? file : null;
    }
    
    /**
     * 通过文件名查找文件
     */
    public async findFileByName(fileName: string): Promise<TFile | null> {
        const folder = this.getActiveFolder();
        if (!folder) return null;
        
        const files = await this.getAllFiles(folder);
        return files.find(file => file.basename === fileName) || null;
    }
    
    /**
     * 打开指定文件
     */
    public async openFile(file: TFile, newLeaf: boolean = true): Promise<void> {
        try {
            const leaf = this.app.workspace.getLeaf(newLeaf);
            await leaf.openFile(file);
        } catch (error) {
            console.error('打开文件失败:', error);
            throw new Error(`无法打开文件: ${file.path}`);
        }
    }
    
    /**
     * 通过文件名打开文件
     */
    public async openFileByName(fileName: string, newLeaf: boolean = true): Promise<void> {
        const file = await this.findFileByName(fileName);
        if (file) {
            await this.openFile(file, newLeaf);
            return;
        }
        throw new Error(`未找到文件: ${fileName}`);
    }
    
    /**
     * 批量处理文件
     */
    public async batchProcessFiles(
        folder: TFolder,
        processor: (file: TFile) => Promise<void>,
        progressCallback?: (processed: number, total: number) => void
    ): Promise<void> {
        const files = await this.getAllFiles(folder);
        const total = files.length;
        let processed = 0;
        
        const batchSize = this.config.batchSize;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            await Promise.all(batch.map(async file => {
                await processor(file);
                processed++;
                progressCallback?.(processed, total);
            }));
            
            // 避免阻塞UI
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    
    /**
     * 检查文件是否存在
     */
    public fileExists(path: string): boolean {
        return this.app.vault.getAbstractFileByPath(path) instanceof TFile;
    }
    
    /**
     * 获取文件元数据
     */
    public getFileMetadata(file: TFile): CachedMetadata | null {
        return this.app.metadataCache.getFileCache(file);
    }
}  
