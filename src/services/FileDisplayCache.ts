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
    // 新增：存储文件链接关系
    private fileLinkMap: Map<string, Set<string>> = new Map(); // 文件到其引用的文件的映射
    // 新增：优先级缓存
    private priorityPaths: Set<string> = new Set(); // 高优先级路径集合，这些路径会被优先处理
    // 新增：缓存预热状态
    private cacheWarmedUp: boolean = false;
    
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
        
        // 新增：限制fileLinkMap大小
        if (this.fileLinkMap.size > this.MAX_CACHE_SIZE) {
            const entriesToRemove = this.fileLinkMap.size - this.MAX_CACHE_SIZE;
            const entries = Array.from(this.fileLinkMap.keys())
                .filter(key => !this.priorityPaths.has(key)) // 保留高优先级路径
                .sort(); // 按字母排序，可以根据需要调整
            
            for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
                this.fileLinkMap.delete(entries[i]);
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
                
                // 新增：恢复文件链接映射
                if (data.fileLinkMap && Array.isArray(data.fileLinkMap)) {
                    data.fileLinkMap.forEach((entry: [string, string[]]) => {
                        const [path, links] = entry;
                        if (path && Array.isArray(links)) {
                            this.fileLinkMap.set(path, new Set(links));
                        }
                    });
                }
                
                this.cacheWarmedUp = true;
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
            // 转换fileLinkMap为可序列化的格式
            const serializedLinkMap: [string, string[]][] = [];
            this.fileLinkMap.forEach((links, path) => {
                serializedLinkMap.push([path, Array.from(links)]);
            });
            
            const data = {
                fileDisplayCache: Array.from(this.fileDisplayCache.entries()),
                originalDisplayNames: Array.from(this.originalDisplayNames.entries()),
                processedFiles: Array.from(this.processedFiles),
                fileModificationTimes: Array.from(this.fileModificationTimes.entries()),
                fileLinkMap: serializedLinkMap
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
        if (!entry) {
            return undefined;
        }
        
        // 更新时间戳表示最近访问
        entry.timestamp = Date.now();
        
        return entry.displayName;
    }
    
    // 设置显示名称
    public setDisplayName(path: string, displayName: string): void {
        // 添加到缓存中
        this.fileDisplayCache.set(path, {
            displayName: displayName,
            timestamp: Date.now()
        });
        
        // 添加到已处理文件集合
        this.processedFiles.add(path);
        
        // 更新文件修改时间记录
        this.updateFileMTime(path);
        
        // 添加到优先级路径
        this.priorityPaths.add(path);
    }
    
    // 批量设置显示名称
    public setDisplayNames(entries: Array<[string, string]>): void {
        const now = Date.now();
        
        // 批量更新displayCache
        entries.forEach(([path, displayName]) => {
            this.fileDisplayCache.set(path, {
                displayName: displayName,
                timestamp: now
            });
            
            // 添加到已处理文件集合
            this.processedFiles.add(path);
            
            // 更新文件修改时间记录
            this.updateFileMTime(path);
        });
    }
    
    // 删除路径
    public deletePath(path: string): void {
        this.fileDisplayCache.delete(path);
        this.originalDisplayNames.delete(path);
        this.processedFiles.delete(path);
        this.fileModificationTimes.delete(path);
        this.priorityPaths.delete(path);
        
        // 清理fileLinkMap
        this.fileLinkMap.delete(path);
    }
    
    // 检查是否已经处理过
    public isProcessed(path: string): boolean {
        return this.processedFiles.has(path);
    }
    
    // 清空所有缓存
    public clearAll(): void {
        this.fileDisplayCache.clear();
        this.originalDisplayNames.clear();
        this.processedFiles.clear();
        this.fileModificationTimes.clear();
        this.fileLinkMap.clear();
        this.priorityPaths.clear();
        this.cacheWarmedUp = false;
    }
    
    // 清空缓存
    public clear(): void {
        this.fileDisplayCache.clear();
        this.processedFiles.clear();
        this.priorityPaths.clear();
    }
    
    // 清除过期的缓存项
    public clearExpired(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];
        
        // 收集过期的项
        this.fileDisplayCache.forEach((value, key) => {
            if (now - value.timestamp > this.CACHE_EXPIRY) {
                keysToDelete.push(key);
            }
        });
        
        // 批量删除过期项
        keysToDelete.forEach(key => {
            this.deletePath(key);
        });
    }
    
    // 获取所有原始名称的映射
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
    
    // 新增：记录文件之间的链接关系
    public addFileLink(sourcePath: string, targetPath: string): void {
        // 获取源文件已有的链接集合
        let links = this.fileLinkMap.get(sourcePath);
        if (!links) {
            links = new Set<string>();
            this.fileLinkMap.set(sourcePath, links);
        }
        
        // 添加目标路径
        links.add(targetPath);
        
        // 将目标路径添加到优先级路径
        this.priorityPaths.add(targetPath);
    }
    
    // 新增：获取文件链接的所有目标
    public getFileLinks(path: string): Set<string> {
        return this.fileLinkMap.get(path) || new Set<string>();
    }
    
    // 新增：预加载相关文件
    public preloadLinkedFiles(path: string): void {
        const links = this.getFileLinks(path);
        
        // 将所有链接的文件添加到优先级路径
        links.forEach(linkedPath => {
            this.priorityPaths.add(linkedPath);
        });
    }
    
    // 新增：检查缓存是否已预热
    public isCacheWarmedUp(): boolean {
        return this.cacheWarmedUp;
    }
    
    // 新增：执行缓存预热
    public async warmUpCache(): Promise<void> {
        if (this.cacheWarmedUp) return;
        
        try {
            // 1. 加载所有markdown文件
            const files = this.plugin?.app?.vault?.getMarkdownFiles() || [];
            
            // 2. 对于每个文件，预先解析其中的链接关系
            for (const file of files) {
                // 获取文件的缓存
                const fileCache = this.plugin?.app?.metadataCache?.getFileCache(file);
                if (!fileCache || !fileCache.links) continue;
                
                // 记录链接关系
                for (const link of fileCache.links) {
                    if (!link.link) continue;
                    
                    // 获取链接目标文件
                    const targetFile = this.plugin?.app?.metadataCache?.getFirstLinkpathDest(link.link, file.path);
                    if (!targetFile) continue;
                    
                    // 添加链接关系
                    this.addFileLink(file.path, targetFile.path);
                }
            }
            
            this.cacheWarmedUp = true;
            
            // 保存缓存数据
            await this.saveCacheToData();
        } catch (error) {
            console.error('Failed to warm up cache:', error);
        }
    }
    
    // 新增：异步获取显示名称，确保缓存有效
    public async ensureDisplayName(path: string): Promise<string | undefined> {
        // 检查缓存中是否已有
        let displayName = this.getDisplayName(path);
        
        // 如果没有，可能需要处理文件来获取显示名称
        if (!displayName) {
            const file = this.plugin?.app?.vault?.getFileByPath(path);
            if (!file) return undefined;
            
            // 这里需要由外部服务调用处理文件
            // 这是一个异步过程，这里我们仅返回undefined
            return undefined;
        }
        
        return displayName;
    }
    
    // 新增：批量预获取多个路径的显示名称
    public batchGetDisplayNames(paths: string[]): Map<string, string> {
        const results = new Map<string, string>();
        
        paths.forEach(path => {
            const displayName = this.getDisplayName(path);
            if (displayName) {
                results.set(path, displayName);
            }
        });
        
        return results;
    }
} 