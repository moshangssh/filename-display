// 文件缓存管理器类，负责处理文件显示名称的缓存
export class FileDisplayCache {
    private fileDisplayCache: Map<string, {
        displayName: string;
        timestamp: number;
    }> = new Map();
    private processedFiles: Set<string> = new Set();
    private originalDisplayNames: Map<string, string> = new Map();
    private readonly CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟缓存过期
    
    constructor() {
        // 初始化缓存
    }
    
    // 保存原始显示名称
    public saveOriginalName(path: string, originalName: string): void {
        if (!this.originalDisplayNames.has(path)) {
            this.originalDisplayNames.set(path, originalName);
        }
    }
    
    // 获取原始显示名称
    public getOriginalName(path: string): string | undefined {
        return this.originalDisplayNames.get(path);
    }
    
    // 检查路径是否有缓存的显示名称
    public hasDisplayName(path: string): boolean {
        if (!this.fileDisplayCache.has(path)) {
            return false;
        }
        
        const cached = this.fileDisplayCache.get(path);
        if (!cached) {
            return false;
        }
        
        // 检查缓存是否过期
        if (Date.now() - cached.timestamp > this.CACHE_EXPIRY) {
            this.fileDisplayCache.delete(path);
            return false;
        }
        
        return true;
    }
    
    // 获取缓存的显示名称
    public getDisplayName(path: string): string | undefined {
        const cached = this.fileDisplayCache.get(path);
        if (!cached) {
            return undefined;
        }
        
        // 检查缓存是否过期
        if (Date.now() - cached.timestamp > this.CACHE_EXPIRY) {
            this.fileDisplayCache.delete(path);
            return undefined;
        }
        
        return cached.displayName;
    }
    
    // 设置显示名称缓存
    public setDisplayName(path: string, displayName: string): void {
        this.fileDisplayCache.set(path, {
            displayName,
            timestamp: Date.now()
        });
        this.processedFiles.add(path);
    }
    
    // 批量设置显示名称缓存
    public setDisplayNames(entries: Array<[string, string]>): void {
        const now = Date.now();
        entries.forEach(([path, displayName]) => {
            this.fileDisplayCache.set(path, {
                displayName,
                timestamp: now
            });
            this.processedFiles.add(path);
        });
    }
    
    // 删除路径的缓存
    public deletePath(path: string): void {
        this.fileDisplayCache.delete(path);
        this.processedFiles.delete(path);
        this.originalDisplayNames.delete(path);
    }
    
    // 判断文件是否已处理
    public isProcessed(path: string): boolean {
        return this.processedFiles.has(path);
    }
    
    // 清除所有缓存
    public clearAll(): void {
        this.fileDisplayCache.clear();
        this.processedFiles.clear();
    }
    
    // 清除过期缓存
    public clearExpired(): void {
        const now = Date.now();
        for (const [path, cached] of this.fileDisplayCache.entries()) {
            if (now - cached.timestamp > this.CACHE_EXPIRY) {
                this.fileDisplayCache.delete(path);
                this.processedFiles.delete(path);
            }
        }
    }
    
    // 获取所有原始名称
    public getAllOriginalNames(): Map<string, string> {
        return this.originalDisplayNames;
    }
} 