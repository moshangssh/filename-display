import { App, TFile, TFolder, normalizePath, Vault } from 'obsidian';
import { CacheManager } from './cacheManager';

/**
 * 文件管理器配置接口
 */
export interface FileManagerConfig {
    batchSize: number;        // 批处理大小
    activeFolder: string;     // 激活的文件夹路径
}

/**
 * 文件管理器类
 * 负责文件的批量检索和处理
 */
export class FileManager {
    constructor(
        private app: App,
        private cacheManager: CacheManager,
        private config: FileManagerConfig
    ) {}
    
    /**
     * 更新配置
     */
    public updateConfig(config: Partial<FileManagerConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 获取当前活动文件夹
     * @returns 活动文件夹或null
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
     * 异步获取文件夹内所有文件
     * 使用缓存机制优化性能
     */
    public async getAllFiles(folder: TFolder): Promise<TFile[]> {
        try {
            // 尝试从缓存获取
            const cachedFiles = this.cacheManager.getCachedFiles(folder.path);
            if (cachedFiles) {
                return cachedFiles;
            }
            
            const files: TFile[] = [];
            
            // 使用迭代器进行分批处理
            await this.processFolder(folder, files);
            
            // 更新缓存
            this.cacheManager.setCachedFiles(folder.path, files);
            
            return files;
        } catch (error) {
            console.error('[Filename Display] 获取文件失败:', error);
            return [];
        }
    }
    
    /**
     * 递归处理文件夹
     * 使用批处理机制避免UI阻塞
     */
    private async processFolder(folder: TFolder, files: TFile[]): Promise<void> {
        let batch: TFile[] = [];
        
        const processBatch = async () => {
            if (batch.length > 0) {
                files.push(...batch);
                batch = [];
                // 让出主线程
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        };
        
        for (const child of folder.children) {
            if (child instanceof TFile) {
                batch.push(child);
                
                if (batch.length >= this.config.batchSize) {
                    await processBatch();
                }
            } else if (child instanceof TFolder) {
                await processBatch(); // 处理当前批次
                await this.processFolder(child, files);
            }
        }
        
        await processBatch(); // 处理剩余文件
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
     * 在活动文件夹中查找指定名称的文件
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
     * 清理活动文件夹的缓存
     */
    public clearActivePathCache(): void {
        const activeFolder = this.config.activeFolder;
        if (activeFolder) {
            const normalizedPath = normalizePath(activeFolder);
            this.cacheManager.clearPathCache(normalizedPath);
        }
    }
    
    /**
     * 批量处理文件
     * 对大量文件应用同一操作，支持异步处理和进度回调
     */
    public async batchProcessFiles(
        folder: TFolder,
        processor: (file: TFile) => Promise<void>,
        progressCallback?: (processed: number, total: number) => void
    ): Promise<void> {
        const files = await this.getAllFiles(folder);
        const total = files.length;
        let processed = 0;
        
        // 分批处理文件
        const batchSize = this.config.batchSize;
        for (let i = 0; i < total; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            
            // 并行处理批次中的文件
            await Promise.all(
                batch.map(async (file) => {
                    try {
                        await processor(file);
                    } catch (error) {
                        console.error(`处理文件失败: ${file.path}`, error);
                    } finally {
                        processed++;
                        if (progressCallback && processed % 10 === 0) {
                            progressCallback(processed, total);
                        }
                    }
                })
            );
            
            // 让出主线程
            await new Promise(resolve => setTimeout(resolve, 0));
            
            // 更新总进度
            if (progressCallback) {
                progressCallback(processed, total);
            }
        }
    }
    
    /**
     * 检查文件是否存在
     */
    public fileExists(path: string): boolean {
        return this.app.vault.getAbstractFileByPath(normalizePath(path)) instanceof TFile;
    }
    
    /**
     * 获取文件元数据
     */
    public async getFileMetadata(file: TFile): Promise<any> {
        try {
            return this.app.metadataCache.getFileCache(file);
        } catch (error) {
            console.error(`获取文件元数据失败: ${file.path}`, error);
            return null;
        }
    }
}  
