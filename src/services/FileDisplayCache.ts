// 文件缓存管理器类，负责处理文件显示名称的缓存
import { TFile } from 'obsidian';
import { ILoggerService, ITimerService, CacheCleanStrategy } from './interfaces/IServices';
import { ServiceContainer, SERVICE_TYPES } from './di/ServiceContainer';
import { FileProcessorService } from './FileProcessorService';

// 定义文件缓存项类型
interface FileCacheItem {
    displayName: string;         // 显示名称
    originalName: string;        // 原始名称
    timestamp: number;           // 最后访问时间戳
    mtime: number;               // 文件修改时间
    processed: boolean;          // 是否已处理
    links: Set<string>;          // 该文件引用的其他文件
    priority: boolean;           // 是否为高优先级
    accessCount: number;         // 访问计数，用于LRU策略
}

export class FileDisplayCache {
    // 主缓存，存储所有文件信息
    private fileCache: Map<string, FileCacheItem> = new Map();
    
    // 使用 WeakMap 存储 DOM 元素关联的数据，避免内存泄漏
    private elementCache: WeakMap<HTMLElement, {
        path: string;
        originalName: string;
    }> = new WeakMap();
    
    private readonly CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟缓存过期
    private readonly HIGH_PRIORITY_EXPIRY = 30 * 60 * 1000; // 高优先级项30分钟过期
    private cleanupTimer: NodeJS.Timeout | number | null = null;
    private readonly CLEANUP_INTERVAL = 10 * 60 * 1000; // 10分钟执行一次清理
    private readonly MAX_CACHE_SIZE = 1000; // 最大缓存条目数
    private readonly CACHE_SIZE_THRESHOLD = Math.floor(this.MAX_CACHE_SIZE * 0.9); // 90%阈值触发清理
    private readonly CACHE_DATA_KEY = 'filename-display-cache'; // 持久化缓存的键名
    private plugin: any; // 存储插件引用，用于访问 app.vault
    private cacheWarmedUp: boolean = false;
    private logger: ILoggerService;
    private serviceContainer: ServiceContainer;
    private cleanStrategy: CacheCleanStrategy = CacheCleanStrategy.LRU; // 默认使用LRU策略
    private lastCleanupTime: number = 0; // 上次清理时间
    private pendingCleanup: boolean = false; // 是否有待处理的清理
    
    constructor(
        private timerCallback?: (cleanupCallback: () => void) => number, 
        plugin?: any,
        loggerService?: ILoggerService
    ) {
        // 存储插件引用
        this.plugin = plugin;
        
        // 设置日志记录器
        this.logger = loggerService?.getLogger('FileDisplayCache') || {
            log: (message: string, ...args: any[]) => console.log(`[FileDisplayCache] ${message}`, ...args),
            info: (message: string, ...args: any[]) => console.info(`[FileDisplayCache] ${message}`, ...args),
            warn: (message: string, ...args: any[]) => console.warn(`[FileDisplayCache] ${message}`, ...args),
            error: (message: string, ...args: any[]) => console.error(`[FileDisplayCache] ${message}`, ...args),
            debug: (message: string, ...args: any[]) => console.debug(`[FileDisplayCache] ${message}`, ...args),
            getLogger: (prefix: string) => this.logger,
            dispose: () => {}
        };
        
        // 获取服务容器
        if (plugin) {
            this.serviceContainer = ServiceContainer.getInstance(plugin);
        }
        
        // 开始定期清理缓存
        this.startPeriodicCleanup();
        
        // 初始化时加载缓存数据
        this.loadCacheFromData();
    }
    
    // 开始定期清理计时器
    private startPeriodicCleanup(): void {
        // 如果已有计时器，先清除
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer as number);
            this.cleanupTimer = null;
        }
        
        // 定义清理回调函数 - 使用惰性清理策略
        const cleanupCallback = () => {
            // 检查是否需要清理（缓存大小超过阈值或者有待处理的清理）
            if (this.fileCache.size > this.CACHE_SIZE_THRESHOLD || this.pendingCleanup) {
                this.logger.debug(`触发缓存清理: 大小=${this.fileCache.size}, 待处理=${this.pendingCleanup}`);
                this.clearExpired();
                this.enforceCacheSizeLimit();
                this.saveCacheToData(); // 定期保存缓存到持久化存储
                this.pendingCleanup = false;
                this.lastCleanupTime = Date.now();
            } else {
                this.logger.debug(`跳过缓存清理: 当前大小=${this.fileCache.size}, 阈值=${this.CACHE_SIZE_THRESHOLD}`);
            }
        };
        
        // 如果提供了定时器回调函数，使用它来创建定时器
        if (this.timerCallback) {
            this.cleanupTimer = this.timerCallback(cleanupCallback);
        } else {
            // 否则使用默认的 setInterval
            this.cleanupTimer = setInterval(cleanupCallback, this.CLEANUP_INTERVAL);
        }
    }
    
    // 限制缓存大小 - 使用选定的缓存清理策略
    private enforceCacheSizeLimit(): void {
        if (this.fileCache.size <= this.MAX_CACHE_SIZE) {
            return;
        }
        
        let entries: [string, FileCacheItem][] = [];
        
        // 根据不同策略排序缓存项
        switch (this.cleanStrategy) {
            case CacheCleanStrategy.LRU:
                // 按访问计数和时间戳排序，保留高优先级项
                entries = Array.from(this.fileCache.entries())
                    .filter(([_, item]) => !item.priority) // 保留优先级项
                    .sort((a, b) => {
                        // 首先按访问计数排序
                        if (a[1].accessCount !== b[1].accessCount) {
                            return a[1].accessCount - b[1].accessCount;
                        }
                        // 访问计数相同时按时间戳排序
                        return a[1].timestamp - b[1].timestamp;
                    });
                break;
                
            case CacheCleanStrategy.FIFO:
                // 按时间戳排序，保留高优先级项
                entries = Array.from(this.fileCache.entries())
                    .filter(([_, item]) => !item.priority)
                    .sort((a, b) => a[1].timestamp - b[1].timestamp);
                break;
                
            case CacheCleanStrategy.PRIORITY:
                // 按优先级和访问计数排序
                entries = Array.from(this.fileCache.entries())
                    .sort((a, b) => {
                        // 优先级高的保留
                        if (a[1].priority !== b[1].priority) {
                            return a[1].priority ? 1 : -1;
                        }
                        // 访问计数高的保留
                        if (a[1].accessCount !== b[1].accessCount) {
                            return a[1].accessCount - b[1].accessCount;
                        }
                        // 最后按时间戳
                        return a[1].timestamp - b[1].timestamp;
                    });
                break;
        }
        
        // 计算要删除的条目数
        const deleteCount = this.fileCache.size - this.MAX_CACHE_SIZE;
        
        // 删除条目
        for (let i = 0; i < deleteCount && i < entries.length; i++) {
            this.fileCache.delete(entries[i][0]);
        }
        
        this.logger.debug(`缓存清理完成: 删除了${Math.min(deleteCount, entries.length)}个条目, 当前大小=${this.fileCache.size}`);
    }
    
    // 从持久化存储加载缓存数据
    private async loadCacheFromData(): Promise<void> {
        if (!this.plugin?.app?.loadData) {
            return;
        }
        
        try {
            const data = await this.plugin.app.loadData(this.CACHE_DATA_KEY);
            if (data && typeof data === 'object' && data.fileCache) {
                for (const [path, item] of data.fileCache) {
                    if (this.isValidCacheItem(path, item)) {
                        // 恢复链接集合
                        const links = new Set<string>(Array.isArray(item.links) ? item.links : []);
                        
                        this.fileCache.set(path, {
                            ...item,
                            links: links,
                        });
                    }
                }
                
                // 检查缓存是否有足够的数据来标记为已预热
                this.cacheWarmedUp = this.fileCache.size > 0;
                
                if (this.cacheWarmedUp) {
                    this.logger?.log(`从持久化存储加载了 ${this.fileCache.size} 个文件缓存项`);
                }
            }
        } catch (error) {
            console.error('Failed to load filename display cache:', error);
        }
    }
    
    // 验证缓存项的完整性
    private isValidCacheItem(path: string, item: any): boolean {
        return (
            path && 
            item && 
            typeof item === 'object' &&
            typeof item.displayName === 'string' &&
            typeof item.originalName === 'string' &&
            typeof item.timestamp === 'number' &&
            typeof item.mtime === 'number'
        );
    }
    
    // 保存缓存数据到持久化存储
    private async saveCacheToData(): Promise<void> {
        if (!this.plugin?.app?.saveData) {
            return;
        }
        
        try {
            // 转换为可序列化格式
            const serializedCache: [string, any][] = Array.from(this.fileCache.entries()).map(
                ([path, item]) => [
                    path, 
                    {
                        ...item,
                        links: Array.from(item.links)
                    }
                ]
            );
            
            await this.plugin.app.saveData(this.CACHE_DATA_KEY, {
                fileCache: serializedCache
            });
        } catch (error) {
            console.error('Failed to save filename display cache:', error);
        }
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
        return this.fileCache.get(path)?.originalName;
    }
    
    // 保存原始文件名
    public saveOriginalName(path: string, originalName: string): void {
        if (!this.fileCache.has(path)) {
            this.initCacheItem(path);
        }
        
        const item = this.fileCache.get(path);
        if (item) {
            item.originalName = originalName;
        }
    }
    
    // 初始化缓存项
    private initCacheItem(path: string): void {
        this.fileCache.set(path, {
            displayName: path.split('/').pop() || path,
            originalName: path.split('/').pop() || path,
            timestamp: Date.now(),
            mtime: 0,
            processed: false,
            links: new Set<string>(),
            priority: false,
            accessCount: 0
        });
    }
    
    // 检查路径是否有显示名称
    public hasDisplayName(path: string): boolean {
        if (!this.fileCache.has(path)) {
            return false;
        }
        
        const cached = this.fileCache.get(path);
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
        
        const item = this.fileCache.get(path);
        const currentMtime = file.stat?.mtime;
        
        // 如果没有缓存的修改时间或者文件被修改过，则缓存无效
        if (!item || !currentMtime || item.mtime < currentMtime) {
            return false;
        }
        
        return true;
    }
    
    // 更新文件修改时间
    public updateFileMTime(path: string): void {
        try {
            const file = this.plugin?.app?.vault?.getFileByPath(path);
            if (!file) return;
            
            const item = this.fileCache.get(path);
            if (item) {
                item.mtime = file.stat?.mtime || 0;
                // 更新访问时间戳和访问计数
                item.timestamp = Date.now();
                item.accessCount++;
            }
        } catch (error) {
            this.logger.error(`更新文件修改时间时出错: ${path}`, error);
        }
    }
    
    // 获取显示名称
    public getDisplayName(path: string): string | undefined {
        try {
            // 安全检查
            if (!path) {
                this.logger.warn('尝试获取空路径的显示名称');
                return undefined;
            }
            
            // 检查缓存中是否存在
            if (!this.fileCache.has(path)) {
                return undefined;
            }
            
            const item = this.fileCache.get(path);
            if (!item) return undefined;
            
            // 检查是否过期 - 根据优先级使用不同的过期时间
            const expiryTime = item.priority ? this.HIGH_PRIORITY_EXPIRY : this.CACHE_EXPIRY;
            if (Date.now() - item.timestamp > expiryTime) {
                // 标记为需要清理，但不立即删除
                this.pendingCleanup = true;
                return undefined;
            }
            
            // 更新访问时间戳和访问计数
            item.timestamp = Date.now();
            item.accessCount++;
            
            // 检查是否需要触发按需清理
            this.checkAndTriggerLazyCleanup();
            
            return item.displayName;
        } catch (error) {
            this.logger.error(`获取路径 ${path} 的显示名称时出错:`, error);
            return undefined;
        }
    }
    
    // 检查是否需要触发惰性清理
    private checkAndTriggerLazyCleanup(): void {
        // 如果缓存大小超过阈值且距离上次清理已经过去了一定时间
        const now = Date.now();
        if (this.fileCache.size > this.CACHE_SIZE_THRESHOLD && 
            now - this.lastCleanupTime > this.CLEANUP_INTERVAL / 2) {
            
            // 使用requestIdleCallback在浏览器空闲时执行清理
            if (this.serviceContainer) {
                const timerService = this.serviceContainer.get<ITimerService>(SERVICE_TYPES.TimerService);
                if (timerService) {
                    timerService.requestIdleCallback(() => {
                        this.clearExpired();
                        this.enforceCacheSizeLimit();
                        this.lastCleanupTime = Date.now();
                    });
                }
            }
        }
    }
    
    // 设置显示名称
    public setDisplayName(path: string, displayName: string): void {
        try {
            // 安全检查
            if (!path) {
                this.logger.warn('尝试为空路径设置显示名称');
                return;
            }
            
            if (!displayName) {
                this.logger.warn(`尝试为路径 ${path} 设置空显示名称`);
                // 回退到使用路径的基础名称
                displayName = path.split('/').pop() || path;
            }
            
            // 如果没有缓存项，创建一个新的
            if (!this.fileCache.has(path)) {
                this.initCacheItem(path);
            }
            
            // 更新缓存项
            const item = this.fileCache.get(path);
            if (item) {
                item.displayName = displayName;
                item.timestamp = Date.now();
                item.processed = true;
                item.priority = true;
                
                // 更新文件修改时间记录
                this.updateFileMTime(path);
            }
        } catch (error) {
            this.logger.error(`设置路径 ${path} 的显示名称时出错:`, error);
        }
    }
    
    // 批量设置显示名称
    public setDisplayNames(entries: Array<[string, string]>): void {
        try {
            // 安全检查
            if (!entries || !Array.isArray(entries)) {
                this.logger.warn('尝试使用无效的条目批量设置显示名称');
                return;
            }
            
            const now = Date.now();
            const validEntries = entries.filter(entry => 
                entry && Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string'
            );
            
            // 批量更新缓存
            validEntries.forEach(([path, displayName]) => {
                try {
                    if (!this.fileCache.has(path)) {
                        this.initCacheItem(path);
                    }
                    
                    const item = this.fileCache.get(path);
                    if (item) {
                        item.displayName = displayName;
                        item.timestamp = now;
                        item.processed = true;
                        
                        // 更新文件修改时间记录
                        this.updateFileMTime(path);
                    }
                } catch (entryError) {
                    this.logger.error(`更新路径 ${path} 时出错:`, entryError);
                }
            });
        } catch (error) {
            this.logger.error('批量设置显示名称时出错:', error);
        }
    }
    
    // 删除路径
    public deletePath(path: string): void {
        try {
            // 安全检查
            if (!path) {
                this.logger.warn('尝试删除空路径的缓存');
                return;
            }
            
            this.fileCache.delete(path);
        } catch (error) {
            this.logger.error(`删除路径 ${path} 的缓存时出错:`, error);
        }
    }
    
    // 检查是否已经处理过
    public isProcessed(path: string): boolean {
        return this.fileCache.get(path)?.processed || false;
    }
    
    // 清空所有缓存
    public clearAll(): void {
        try {
            this.fileCache.clear();
            this.cacheWarmedUp = false;
        } catch (error) {
            this.logger.error('清空所有缓存时出错:', error);
        }
    }
    
    // 清空缓存但保留元数据（如原始名称）
    public clear(): void {
        try {
            // 清除处理标记和显示名称，但保留元数据
            for (const [path, item] of this.fileCache.entries()) {
                item.processed = false;
                item.priority = false;
            }
        } catch (error) {
            this.logger.error('清空缓存时出错:', error);
        }
    }
    
    // 清除过期的缓存项
    public clearExpired(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];
        let normalExpired = 0;
        let priorityExpired = 0;
        
        // 收集过期的项
        this.fileCache.forEach((value, key) => {
            const expiryTime = value.priority ? this.HIGH_PRIORITY_EXPIRY : this.CACHE_EXPIRY;
            if (now - value.timestamp > expiryTime) {
                if (value.priority) {
                    priorityExpired++;
                } else {
                    normalExpired++;
                }
                keysToDelete.push(key);
            }
        });
        
        // 批量删除过期项
        keysToDelete.forEach(key => {
            this.deletePath(key);
        });
        
        if (keysToDelete.length > 0) {
            this.logger.debug(`清理过期缓存: 删除了${keysToDelete.length}个条目 (普通: ${normalExpired}, 高优先级: ${priorityExpired})`);
        }
    }
    
    // 获取所有原始名称的映射
    public getAllOriginalNames(): Map<string, string> {
        const result = new Map<string, string>();
        
        for (const [path, item] of this.fileCache.entries()) {
            if (item.originalName) {
                result.set(path, item.originalName);
            }
        }
        
        return result;
    }
    
    // 停止定期清理
    public stopPeriodicCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer as number);
            this.cleanupTimer = null;
        }
    }
    
    // 记录文件之间的链接关系
    public addFileLink(sourcePath: string, targetPath: string): void {
        // 确保源文件存在缓存项
        if (!this.fileCache.has(sourcePath)) {
            this.initCacheItem(sourcePath);
        }
        
        // 确保目标文件存在缓存项
        if (!this.fileCache.has(targetPath)) {
            this.initCacheItem(targetPath);
        }
        
        // 添加链接关系
        const sourceItem = this.fileCache.get(sourcePath);
        if (sourceItem) {
            sourceItem.links.add(targetPath);
            
            // 设置目标为高优先级
            const targetItem = this.fileCache.get(targetPath);
            if (targetItem) {
                targetItem.priority = true;
            }
        }
    }
    
    // 获取文件链接的所有目标
    public getFileLinks(path: string): Set<string> {
        return this.fileCache.get(path)?.links || new Set<string>();
    }
    
    // 预加载相关文件
    public preloadLinkedFiles(path: string): void {
        const links = this.getFileLinks(path);
        
        // 将所有链接的文件标记为高优先级
        links.forEach(linkedPath => {
            if (this.fileCache.has(linkedPath)) {
                const item = this.fileCache.get(linkedPath);
                if (item) {
                    item.priority = true;
                }
            } else {
                this.initCacheItem(linkedPath);
                const item = this.fileCache.get(linkedPath);
                if (item) {
                    item.priority = true;
                }
            }
        });
    }
    
    // 检查缓存是否已预热
    public isCacheWarmedUp(): boolean {
        return this.cacheWarmedUp;
    }
    
    // 执行缓存预热
    public async warmUpCache(): Promise<void> {
        if (this.cacheWarmedUp) return;
        
        try {
            // 首先尝试从持久化存储加载缓存
            await this.loadCacheFromData();
            
            // 如果缓存已经加载成功，则不需要重新预热
            if (this.cacheWarmedUp) {
                this.logger?.log('从持久化存储成功加载缓存数据');
                return;
            }
            
            // 如果没有缓存或缓存加载失败，则执行预热
            this.logger?.log('开始执行渐进式缓存预热...');
            
            // 1. 加载所有markdown文件
            const files = this.plugin?.app?.vault?.getMarkdownFiles() || [];
            
            // 2. 分离可见文件和其他文件
            const fileProcessorService = this.serviceContainer.get<FileProcessorService>(SERVICE_TYPES.FileProcessorService);
            const { visibleFiles, otherFiles } = fileProcessorService.separateFilesByVisibility(files);
            
            // 3. 先处理可见文件
            for (const file of visibleFiles) {
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
            
            // 4. 在后台处理其他文件
            if (otherFiles.length > 0) {
                // 创建一个处理函数
                const processFile = async (file: TFile) => {
                    const fileCache = this.plugin?.app?.metadataCache?.getFileCache(file);
                    if (!fileCache || !fileCache.links) return;
                    
                    for (const link of fileCache.links) {
                        if (!link.link) continue;
                        
                        const targetFile = this.plugin?.app?.metadataCache?.getFirstLinkpathDest(link.link, file.path);
                        if (!targetFile) continue;
                        
                        this.addFileLink(file.path, targetFile.path);
                    }
                };
                
                // 使用TimerService在空闲时间处理其余文件
                const timerService = this.serviceContainer.get<ITimerService>(SERVICE_TYPES.TimerService);
                
                // 分批处理文件
                const batchSize = 20;
                for (let i = 0; i < otherFiles.length; i += batchSize) {
                    const batch = otherFiles.slice(i, i + batchSize);
                    
                    // 使用requestIdleCallback在浏览器空闲时处理
                    timerService.requestIdleCallback(async () => {
                        for (const file of batch) {
                            await processFile(file);
                        }
                        
                        // 如果这是最后一批，标记缓存预热完成并保存
                        if (i + batchSize >= otherFiles.length) {
                            this.cacheWarmedUp = true;
                            await this.saveCacheToData();
                            this.logger?.log('缓存预热完成，已保存到持久化存储');
                        }
                    });
                }
            } else {
                // 如果没有其他文件需要处理，直接标记完成并保存
                this.cacheWarmedUp = true;
                await this.saveCacheToData();
                this.logger?.log('缓存预热完成，已保存到持久化存储');
            }
        } catch (error) {
            console.error('Failed to warm up cache:', error);
        }
    }
    
    // 异步获取显示名称，确保缓存有效
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
    
    // 批量预获取多个路径的显示名称
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
    
    /**
     * 设置缓存清理策略
     * @param strategy 清理策略
     */
    public setCacheCleanStrategy(strategy: CacheCleanStrategy): void {
        this.cleanStrategy = strategy;
        this.logger.log(`已设置缓存清理策略: ${CacheCleanStrategy[strategy]}`);
    }
    
    /**
     * 获取当前缓存清理策略
     */
    public getCacheCleanStrategy(): CacheCleanStrategy {
        return this.cleanStrategy;
    }
    
    /**
     * 手动触发缓存清理
     */
    public triggerCleanup(): void {
        this.clearExpired();
        this.enforceCacheSizeLimit();
        this.saveCacheToData();
        this.lastCleanupTime = Date.now();
        this.pendingCleanup = false;
    }
    
    /**
     * 释放资源
     */
    public dispose(): void {
        // 停止周期性清理任务
        this.stopPeriodicCleanup();
        
        // 清空缓存数据
        this.clearAll();
        
        this.logger.log('FileDisplayCache资源已释放');
    }
} 