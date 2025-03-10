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
    // 存储文件最后修改时间
    private fileModificationTimes: Map<string, number> = new Map();
    private readonly CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟缓存过期
    private cleanupTimer: NodeJS.Timeout | number | null = null;
    private readonly CLEANUP_INTERVAL = 10 * 60 * 1000; // 10分钟执行一次清理
    private readonly MAX_CACHE_SIZE = 1000; // 最大缓存条目数
    private readonly CACHE_DATA_KEY = 'filename-display-cache'; // 持久化缓存的键名
    private plugin: any; // 存储插件引用，用于访问 app.vault
    
    constructor(private timerCallback?: (cleanupCallback: () => void) => number, plugin?: any) {
        // 初始化缓存并设置定期清理
        this.plugin = plugin;
        this.startPeriodicCleanup();
        
        // 尝试从持久化数据加载缓存
        this.loadCacheFromData();
    }
    
    // 开始定期清理计时器
    private startPeriodicCleanup(): void {
        // 如果已有计时器，先清除
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer as number);
            this.cleanupTimer = null;
        }
        
        // 定义清理回调函数
        const cleanupCallback = () => {
            this.clearExpired();
            this.enforceCacheSizeLimit();
            this.saveCacheToData(); // 定期保存缓存到持久化存储
        };
        
        // 如果提供了定时器回调函数，使用它来创建定时器
        if (this.timerCallback) {
            this.cleanupTimer = this.timerCallback(cleanupCallback);
        } else {
            // 否则使用默认的 setInterval
            this.cleanupTimer = setInterval(cleanupCallback, this.CLEANUP_INTERVAL);
        }
    }
    
    // 限制缓存大小
    private enforceCacheSizeLimit(): void {
        // 限制fileDisplayCache大小，按时间戳排序
        this.limitMapCache(
            this.fileDisplayCache,
            this.MAX_CACHE_SIZE,
            (entries) => entries.sort((a, b) => a[1].timestamp - b[1].timestamp),
            (path) => this.deletePath(path)
        );
        
        // 限制originalDisplayNames大小
        if (this.originalDisplayNames.size > this.MAX_CACHE_SIZE) {
            const entriesToRemove = this.originalDisplayNames.size - this.MAX_CACHE_SIZE;
            const entries = Array.from(this.originalDisplayNames.keys());
            
            for (let i = 0; i < entriesToRemove; i++) {
                this.originalDisplayNames.delete(entries[i]);
            }
        }
    }
    
    // 通用方法：限制Map缓存大小
    private limitMapCache<T, V>(
        cache: Map<T, V>, 
        maxSize: number,
        sortFn: (entries: [T, V][]) => [T, V][],
        deleteFn: (key: T) => void
    ): void {
        if (cache.size > maxSize) {
            const entriesToRemove = cache.size - maxSize;
            const entries = sortFn(Array.from(cache.entries()));
            
            for (let i = 0; i < entriesToRemove; i++) {
                const key = entries[i][0];
                deleteFn(key);
            }
        }
    }
    
    // 从持久化存储加载缓存数据
    private async loadCacheFromData(): Promise<void> {
        if (!this.plugin?.app?.loadData) {
            return;
        }
        
        try {
            const data = await this.plugin.app.loadData(this.CACHE_DATA_KEY);
            if (data && typeof data === 'object') {
                // 恢复文件显示缓存
                if (data.fileDisplayCache && Array.isArray(data.fileDisplayCache)) {
                    data.fileDisplayCache.forEach((entry: [string, { displayName: string, timestamp: number }]) => {
                        const [path, value] = entry;
                        // 验证缓存项是否有效
                        if (path && value && value.displayName && value.timestamp) {
                            this.fileDisplayCache.set(path, value);
                        }
                    });
                }
                
                // 恢复原始文件名缓存
                if (data.originalDisplayNames && Array.isArray(data.originalDisplayNames)) {
                    data.originalDisplayNames.forEach((entry: [string, string]) => {
                        const [path, name] = entry;
                        if (path && name) {
                            this.originalDisplayNames.set(path, name);
                        }
                    });
                }
                
                // 恢复已处理文件集合
                if (data.processedFiles && Array.isArray(data.processedFiles)) {
                    data.processedFiles.forEach((path: string) => {
                        if (path) {
                            this.processedFiles.add(path);
                        }
                    });
                }
                
                // 恢复文件修改时间缓存
                if (data.fileModificationTimes && Array.isArray(data.fileModificationTimes)) {
                    data.fileModificationTimes.forEach((entry: [string, number]) => {
                        const [path, mtime] = entry;
                        if (path && typeof mtime === 'number') {
                            this.fileModificationTimes.set(path, mtime);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Failed to load filename display cache:', error);
        }
    }
    
    // 保存缓存数据到持久化存储
    private async saveCacheToData(): Promise<void> {
        if (!this.plugin?.app?.saveData) {
            return;
        }
        
        try {
            const data = {
                fileDisplayCache: Array.from(this.fileDisplayCache.entries()),
                originalDisplayNames: Array.from(this.originalDisplayNames.entries()),
                processedFiles: Array.from(this.processedFiles),
                fileModificationTimes: Array.from(this.fileModificationTimes.entries())
            };
            
            await this.plugin.app.saveData(this.CACHE_DATA_KEY, data);
        } catch (error) {
            console.error('Failed to save filename display cache:', error);
        }
    }
    
    // 保存原始文件名
    public saveOriginalName(path: string, originalName: string): void {
        this.originalDisplayNames.set(path, originalName);
    }
    
    // 保存元素数据到元素缓存
    public saveElementData(element: HTMLElement, path: string, originalName: string): void {
        this.elementCache.set(element, { path, originalName });
    }
    
    // 获取元素关联的数据
    public getElementData(element: HTMLElement): { path: string; originalName: string } | undefined {
        return this.elementCache.get(element);
    }
    
    // 获取原始文件名
    public getOriginalName(path: string): string | undefined {
        return this.originalDisplayNames.get(path);
    }
    
    // 检查路径是否有显示名称
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
    
    // 检查缓存是否仍然有效（基于文件修改时间）
    public isCacheValid(path: string): boolean {
        // 如果没有对应的缓存项，返回 false
        if (!this.hasDisplayName(path)) return false;
        
        // 检查文件修改时间
        const file = this.plugin?.app?.vault?.getFileByPath(path);
        if (!file) return false;
        
        const cachedMtime = this.fileModificationTimes.get(path);
        const currentMtime = file.stat?.mtime;
        
        // 如果没有缓存的修改时间或者文件被修改过，则缓存无效
        if (!cachedMtime || !currentMtime || cachedMtime < currentMtime) {
            return false;
        }
        
        return true;
    }
    
    // 更新文件修改时间
    public updateFileMTime(path: string): void {
        const file = this.plugin?.app?.vault?.getFileByPath(path);
        if (file && file.stat) {
            this.fileModificationTimes.set(path, file.stat.mtime);
        }
    }
    
    // 获取显示名称（增加时间戳检查）
    public getDisplayName(path: string): string | undefined {
        // 在返回缓存前检查缓存是否有效
        if (!this.isCacheValid(path)) {
            // 如果缓存无效，返回 undefined 促使重新处理
            return undefined;
        }
        
        if (!this.fileDisplayCache.has(path)) {
            return undefined;
        }
        
        const entry = this.fileDisplayCache.get(path);
        const now = Date.now();
        
        // 如果缓存过期，返回 undefined 促使重新处理
        if (now - entry!.timestamp > this.CACHE_EXPIRY) {
            return undefined;
        }
        
        return entry!.displayName;
    }
    
    // 设置显示名称
    public setDisplayName(path: string, displayName: string): void {
        this.fileDisplayCache.set(path, {
            displayName,
            timestamp: Date.now()
        });
        this.processedFiles.add(path);
        
        // 更新文件修改时间
        this.updateFileMTime(path);
        
        // 当更新缓存时保存到持久化存储
        this.saveCacheToData();
    }
    
    // 批量设置显示名称
    public setDisplayNames(entries: Array<[string, string]>): void {
        const now = Date.now();
        
        for (const [path, displayName] of entries) {
            this.fileDisplayCache.set(path, {
                displayName,
                timestamp: now
            });
            this.processedFiles.add(path);
            
            // 更新文件修改时间
            this.updateFileMTime(path);
        }
        
        // 当批量更新缓存时保存到持久化存储
        this.saveCacheToData();
    }
    
    // 删除路径的缓存
    public deletePath(path: string): void {
        this.fileDisplayCache.delete(path);
        this.originalDisplayNames.delete(path);
        this.processedFiles.delete(path);
        
        // 当删除缓存条目时保存到持久化存储
        this.saveCacheToData();
    }
    
    // 检查文件是否已处理
    public isProcessed(path: string): boolean {
        return this.processedFiles.has(path);
    }
    
    // 清空所有缓存
    public clearAll(): void {
        this.clear();
        this.originalDisplayNames.clear();
        
        // 当清空所有缓存时保存到持久化存储
        this.saveCacheToData();
    }
    
    // 清空文件显示缓存
    public clear(): void {
        this.fileDisplayCache.clear();
        this.processedFiles.clear();
        
        // 当清空缓存时保存到持久化存储
        this.saveCacheToData();
    }
    
    // 清理过期的缓存项
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
            clearInterval(this.cleanupTimer as number);
            this.cleanupTimer = null;
        }
    }
} 