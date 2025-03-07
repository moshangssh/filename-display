// 文件缓存管理器类，负责处理文件显示名称的缓存
export class FileDisplayCache {
    private fileDisplayCache: Map<string, {
        displayName: string;
        timestamp: number;
    }> = new Map();
    private processedFiles: Set<string> = new Set();
    // 将字符串映射改为 DOM 元素的 WeakMap
    private originalDisplayNames: Map<string, string> = new Map();
    // 使用 WeakMap 存储 DOM 元素关联的数据，避免内存泄漏
    private elementCache: WeakMap<HTMLElement, {
        path: string;
        originalName: string;
    }> = new WeakMap();
    private readonly CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟缓存过期
    private cleanupTimer: NodeJS.Timeout | null = null;
    private readonly CLEANUP_INTERVAL = 10 * 60 * 1000; // 10分钟执行一次清理
    private readonly MAX_CACHE_SIZE = 1000; // 最大缓存条目数
    
    constructor() {
        // 初始化缓存并设置定期清理
        this.startPeriodicCleanup();
    }
    
    // 开始定期清理计时器
    private startPeriodicCleanup(): void {
        // 如果已有计时器，先清除
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        // 设置定期清理
        this.cleanupTimer = setInterval(() => {
            this.clearExpired();
            this.enforceCacheSizeLimit();
        }, this.CLEANUP_INTERVAL);
    }
    
    // 限制缓存大小
    private enforceCacheSizeLimit(): void {
        // 如果缓存超过限制，移除最旧的条目
        if (this.fileDisplayCache.size > this.MAX_CACHE_SIZE) {
            const entriesToRemove = this.fileDisplayCache.size - this.MAX_CACHE_SIZE;
            const entries = Array.from(this.fileDisplayCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp); // 按时间戳排序
            
            for (let i = 0; i < entriesToRemove; i++) {
                const [path] = entries[i];
                this.deletePath(path);
            }
        }
        
        // 同样限制 originalDisplayNames 的大小
        if (this.originalDisplayNames.size > this.MAX_CACHE_SIZE) {
            const entriesToRemove = this.originalDisplayNames.size - this.MAX_CACHE_SIZE;
            const entries = Array.from(this.originalDisplayNames.keys());
            
            for (let i = 0; i < entriesToRemove; i++) {
                this.originalDisplayNames.delete(entries[i]);
            }
        }
    }
    
    // 保存原始显示名称
    public saveOriginalName(path: string, originalName: string): void {
        if (!this.originalDisplayNames.has(path)) {
            this.originalDisplayNames.set(path, originalName);
        }
    }
    
    // 为DOM元素保存关联数据
    public saveElementData(element: HTMLElement, path: string, originalName: string): void {
        this.elementCache.set(element, { path, originalName });
    }
    
    // 从DOM元素获取关联数据
    public getElementData(element: HTMLElement): { path: string; originalName: string } | undefined {
        return this.elementCache.get(element);
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
            this.deletePath(path);
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
            this.deletePath(path);
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
        this.originalDisplayNames.clear();
        // WeakMap 不需要手动清理，会自动垃圾回收
    }
    
    // 清除过期缓存
    public clearExpired(): void {
        const now = Date.now();
        const expiredPaths: string[] = [];
        
        // 收集过期的路径
        for (const [path, cached] of this.fileDisplayCache.entries()) {
            if (now - cached.timestamp > this.CACHE_EXPIRY) {
                expiredPaths.push(path);
            }
        }
        
        // 删除过期的缓存条目
        expiredPaths.forEach(path => this.deletePath(path));
    }
    
    // 获取所有原始名称
    public getAllOriginalNames(): Map<string, string> {
        return this.originalDisplayNames;
    }
    
    // 停止定期清理
    public stopPeriodicCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
} 