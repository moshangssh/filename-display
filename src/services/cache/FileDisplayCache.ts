import { TFile } from 'obsidian';
import { 
    IFileDisplayCache, 
    ICacheStorage,
    ICacheStrategy,
    ICacheWarmer,
    IPersistenceManager,
    IElementAssociator,
    ICacheMetadataManager,
    FileCacheItem,
    CacheData
} from './interfaces';
import { FileDisplayResult } from '../../types';
import { CacheCleanStrategy, ILoggerService, ITimerService } from '../interfaces/IServices';
import { ITitleExtractorPlugin } from '../../types';
import { CacheStrategyFactory } from './strategies/CacheStrategyFactory';

/**
 * 文件显示缓存类
 * 作为外观模式整合各个缓存组件
 */
export class FileDisplayCache implements IFileDisplayCache {
    private readonly CACHE_DATA_KEY = 'filename-display-cache';
    private readonly CLEANUP_INTERVAL = 10 * 60 * 1000; // 10分钟执行一次清理
    private cleanupTimer: number | null = null;
    private lastCleanupTime: number = 0;
    private pendingCleanup: boolean = false;
    private cacheCleanStrategy: CacheCleanStrategy = CacheCleanStrategy.LRU;
    private cacheWarmedUp: boolean = false;
    
    constructor(
        private readonly cacheStorage: ICacheStorage<string, FileCacheItem>,
        private readonly elementAssociator: IElementAssociator,
        private readonly metadataManager: ICacheMetadataManager,
        private readonly persistenceManager: IPersistenceManager<CacheData>,
        private readonly cacheWarmer: ICacheWarmer,
        private readonly plugin: ITitleExtractorPlugin,
        private readonly logger: ILoggerService,
        private readonly timerService: ITimerService
    ) {
        // 初始化
        this.loadCacheFromData().catch(err => {
            this.logger.error('加载缓存数据失败:', err);
        });
        
        // 启动定期清理
        this.startPeriodicCleanup();
    }
    
    /**
     * 开始定期清理任务
     */
    private startPeriodicCleanup(): void {
        if (this.cleanupTimer !== null) {
            this.timerService.clearInterval(this.cleanupTimer);
        }
        
        this.cleanupTimer = this.timerService.setInterval(() => {
            this.clearExpired();
        }, this.CLEANUP_INTERVAL);
    }
    
    /**
     * 从持久化存储加载缓存数据
     */
    private async loadCacheFromData(): Promise<void> {
        try {
            const savedData = await this.persistenceManager.load();
            if (savedData && savedData.fileCache) {
                for (const [path, itemData] of savedData.fileCache) {
                    // 将字符串数组转换为Set
                    const links = new Set<string>(itemData.links);
                    
                    // 创建缓存项
                    const item: FileCacheItem = {
                        displayName: itemData.displayName,
                        originalName: itemData.originalName,
                        timestamp: itemData.timestamp,
                        mtime: itemData.mtime,
                        processed: itemData.processed,
                        priority: itemData.priority,
                        accessCount: itemData.accessCount,
                        links,
                        result: itemData.result
                    };
                    
                    this.cacheStorage.set(path, item);
                }
                this.logger.info(`已从持久化存储加载 ${savedData.fileCache.length} 条缓存项`);
            }
        } catch (error) {
            this.logger.error('加载缓存数据时出错:', error);
        }
    }
    
    /**
     * 保存缓存数据到持久化存储
     */
    private async saveCacheToData(): Promise<void> {
        try {
            // 获取所有缓存条目
            const entries = this.cacheStorage.entries();
            
            // 筛选访问次数超过阈值的条目进行持久化
            const fileCacheEntries: [string, Omit<FileCacheItem, 'links'> & { links: string[] }][] = [];
            
            for (const [path, item] of entries) {
                if (item.accessCount >= this.plugin.settings.persistentCacheHeatThreshold) {
                    // 将Set转换为数组
                    const links = Array.from(item.links);
                    
                    // 创建可序列化的条目数据
                    const serializableItem = {
                        displayName: item.displayName,
                        originalName: item.originalName,
                        timestamp: item.timestamp,
                        mtime: item.mtime,
                        processed: item.processed,
                        priority: item.priority,
                        accessCount: item.accessCount,
                        links,
                        result: item.result
                    };
                    
                    fileCacheEntries.push([path, serializableItem]);
                }
            }
            
            // 创建缓存数据对象
            const cacheData: CacheData = {
                fileCache: fileCacheEntries
            };
            
            // 保存到持久化存储
            if (fileCacheEntries.length > 0) {
                await this.persistenceManager.save(cacheData);
                this.logger.info(`已持久化保存 ${fileCacheEntries.length} 条缓存项`);
            }
        } catch (error) {
            this.logger.error('保存缓存数据时出错:', error);
        }
    }
    
    // IFileDisplayCache 接口实现
    
    /**
     * 获取缓存项
     */
    public get(path: string): FileDisplayResult | undefined {
        const item = this.cacheStorage.get(path);
        if (item && item.result) {
            // 更新访问时间和计数
            this.metadataManager.updateAccessTime(path);
            this.metadataManager.incrementAccessCount(path);
            
            return item.result;
        }
        return undefined;
    }
    
    /**
     * 设置缓存项
     */
    public set(path: string, result: FileDisplayResult): void {
        const existingItem = this.cacheStorage.get(path);
        
        if (existingItem) {
            existingItem.result = result;
            existingItem.displayName = result.displayName;
            this.metadataManager.updateAccessTime(path);
            this.cacheStorage.set(path, existingItem);
        } else {
            // 创建新缓存项
            const newItem: FileCacheItem = {
                displayName: result.displayName,
                originalName: result.displayName, // 初始化为相同值，后续可更新
                timestamp: Date.now(),
                mtime: 0, // 需要通过 updateFileMTime 更新
                processed: true,
                links: new Set<string>(),
                priority: false,
                accessCount: 1,
                result: result
            };
            
            this.cacheStorage.set(path, newItem);
        }
        
        // 如果缓存大小超过阈值，触发清理
        this.checkAndTriggerLazyCleanup();
    }
    
    /**
     * 检查是否需要触发延迟清理
     */
    private checkAndTriggerLazyCleanup(): void {
        const MAX_CACHE_SIZE = 1000; // 最大缓存条目数
        const CACHE_SIZE_THRESHOLD = Math.floor(MAX_CACHE_SIZE * 0.9); // 90%阈值触发清理
        
        // 如果缓存大小超过阈值且没有待处理的清理
        if (this.cacheStorage.size() > CACHE_SIZE_THRESHOLD && !this.pendingCleanup) {
            this.pendingCleanup = true;
            
            // 使用requestIdleCallback在浏览器空闲时执行清理
            this.timerService.requestIdleCallback(() => {
                this.triggerCleanup();
                this.pendingCleanup = false;
            });
        }
    }
    
    /**
     * 删除指定路径的缓存
     */
    public deletePath(path: string): void {
        if (this.cacheStorage.has(path)) {
            this.cacheStorage.delete(path);
        }
    }
    
    /**
     * 清空缓存但保留设置
     */
    public clear(): void {
        this.cacheStorage.clear();
        this.saveCacheToData().catch(err => {
            this.logger.error('保存缓存数据失败:', err);
        });
    }
    
    /**
     * 清空所有缓存并重置设置
     */
    public clearAll(): void {
        this.clear();
        this.cacheWarmedUp = false;
    }
    
    /**
     * 获取文件显示名称
     */
    public getDisplayName(path: string): string | undefined {
        const item = this.cacheStorage.get(path);
        if (item) {
            // 检查缓存是否有效
            if (this.isCacheValid(path)) {
                this.metadataManager.updateAccessTime(path);
                this.metadataManager.incrementAccessCount(path);
                return item.displayName;
            } else {
                // 缓存过期，需要重新处理
                return undefined;
            }
        }
        return undefined;
    }
    
    /**
     * 设置文件显示名称
     */
    public setDisplayName(path: string, displayName: string): void {
        let item = this.cacheStorage.get(path);
        
        if (item) {
            item.displayName = displayName;
            item.processed = true;
            this.metadataManager.updateAccessTime(path);
            this.cacheStorage.set(path, item);
        } else {
            // 创建新的缓存项
            item = {
                displayName: displayName,
                originalName: '', // 需要通过 saveOriginalName 设置
                timestamp: Date.now(),
                mtime: 0, // 需要通过 updateFileMTime 更新
                processed: true,
                links: new Set<string>(),
                priority: false,
                accessCount: 1,
                result: {
                    success: true,
                    displayName: displayName
                }
            };
            
            this.cacheStorage.set(path, item);
        }
        
        // 如果缓存大小超过阈值，触发清理
        this.checkAndTriggerLazyCleanup();
    }
    
    /**
     * 检查是否存在显示名称
     */
    public hasDisplayName(path: string): boolean {
        const item = this.cacheStorage.get(path);
        return !!item && !!item.displayName && this.isCacheValid(path);
    }
    
    /**
     * 批量设置显示名称
     */
    public setDisplayNames(entries: Array<[string, string]>): void {
        for (const [path, displayName] of entries) {
            this.setDisplayName(path, displayName);
        }
    }
    
    /**
     * 保存原始文件名
     */
    public saveOriginalName(path: string, originalName: string): void {
        let item = this.cacheStorage.get(path);
        
        if (item) {
            item.originalName = originalName;
            this.cacheStorage.set(path, item);
        } else {
            // 创建新的缓存项
            item = {
                displayName: originalName, // 初始设置为原始名称
                originalName: originalName,
                timestamp: Date.now(),
                mtime: 0,
                processed: false,
                links: new Set<string>(),
                priority: false,
                accessCount: 1,
                result: undefined
            };
            
            this.cacheStorage.set(path, item);
        }
    }
    
    /**
     * 获取原始文件名
     */
    public getOriginalName(path: string): string | undefined {
        const item = this.cacheStorage.get(path);
        return item ? item.originalName : undefined;
    }
    
    /**
     * 获取所有原始文件名映射
     */
    public getAllOriginalNames(): Map<string, string> {
        const result = new Map<string, string>();
        
        for (const [path, item] of this.cacheStorage.entries()) {
            if (item.originalName) {
                result.set(path, item.originalName);
            }
        }
        
        return result;
    }
    
    /**
     * 保存元素关联数据
     */
    public saveElementData(element: HTMLElement, path: string, originalName: string): void {
        this.elementAssociator.associate(element, path, originalName);
    }
    
    /**
     * 获取元素关联数据
     */
    public getElementData(element: HTMLElement): { path: string; originalName: string } | undefined {
        return this.elementAssociator.getAssociation(element);
    }
    
    /**
     * 检查缓存是否有效
     */
    public isCacheValid(path: string): boolean {
        return !this.metadataManager.isExpired(path);
    }
    
    /**
     * 检查文件是否已处理
     */
    public isProcessed(path: string): boolean {
        const item = this.cacheStorage.get(path);
        return !!item && item.processed;
    }
    
    /**
     * 更新文件修改时间
     */
    public updateFileMTime(path: string): void {
        const item = this.cacheStorage.get(path);
        
        if (item) {
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                item.mtime = file.stat.mtime;
                this.cacheStorage.set(path, item);
            }
        }
    }
    
    /**
     * 清理过期的缓存项
     */
    public clearExpired(): void {
        const now = Date.now();
        const timeSinceLastCleanup = now - this.lastCleanupTime;
        
        // 避免过于频繁的清理
        const MIN_CLEANUP_INTERVAL = 60 * 1000; // 1分钟
        if (timeSinceLastCleanup < MIN_CLEANUP_INTERVAL) {
            return;
        }
        
        this.lastCleanupTime = now;
        this.logger.debug('正在清理过期的缓存项...');
        
        // 获取当前策略
        const strategy = CacheStrategyFactory.createStrategy(this.cacheCleanStrategy, this.logger);
        
        // 使用策略清理缓存
        strategy.evict(this.cacheStorage, 0); // 0表示清理所有过期项
        
        // 保存清理后的缓存
        this.saveCacheToData().catch(err => {
            this.logger.error('保存缓存数据失败:', err);
        });
    }
    
    /**
     * 添加文件链接关系
     */
    public addFileLink(sourcePath: string, targetPath: string): void {
        const item = this.cacheStorage.get(sourcePath);
        
        if (item) {
            item.links.add(targetPath);
            this.cacheStorage.set(sourcePath, item);
        } else {
            // 创建新的缓存项并添加链接
            const newItem: FileCacheItem = {
                displayName: '',
                originalName: '',
                timestamp: Date.now(),
                mtime: 0,
                processed: false,
                links: new Set<string>([targetPath]),
                priority: false,
                accessCount: 1,
                result: undefined
            };
            
            this.cacheStorage.set(sourcePath, newItem);
        }
    }
    
    /**
     * 获取文件链接
     */
    public getFileLinks(path: string): Set<string> {
        const item = this.cacheStorage.get(path);
        return item ? item.links : new Set<string>();
    }
    
    /**
     * 预加载链接的文件
     */
    public preloadLinkedFiles(path: string): void {
        const links = this.getFileLinks(path);
        
        for (const linkedPath of links) {
            const file = this.plugin.app.vault.getAbstractFileByPath(linkedPath);
            if (file instanceof TFile) {
                // 设置为高优先级
                const item = this.cacheStorage.get(linkedPath);
                if (item) {
                    this.metadataManager.setPriority(linkedPath, true);
                }
            }
        }
    }
    
    /**
     * 预热缓存
     */
    public async warmUpCache(): Promise<void> {
        return this.cacheWarmer.warmUp();
    }
    
    /**
     * 取消缓存预热
     */
    public cancelWarmupCache(): void {
        this.cacheWarmer.cancel();
    }
    
    /**
     * 检查缓存是否已预热
     */
    public isCacheWarmedUp(): boolean {
        return this.cacheWarmedUp;
    }
    
    /**
     * 获取预热进度
     */
    public getWarmupProgress(): number {
        return this.cacheWarmer.getProgress();
    }
    
    /**
     * 检查是否正在预热
     */
    public isWarmingUp(): boolean {
        return this.cacheWarmer.isWarming();
    }
    
    /**
     * 设置缓存清理策略
     */
    public setCacheCleanStrategy(strategy: CacheCleanStrategy): void {
        this.cacheCleanStrategy = strategy;
    }
    
    /**
     * 获取缓存清理策略
     */
    public getCacheCleanStrategy(): CacheCleanStrategy {
        return this.cacheCleanStrategy;
    }
    
    /**
     * 触发缓存清理
     */
    public triggerCleanup(): void {
        const strategy = CacheStrategyFactory.createStrategy(this.cacheCleanStrategy, this.logger);
        
        // 使用策略清理缓存，清理20%的条目
        const cacheSizeToRemove = Math.floor(this.cacheStorage.size() * 0.2);
        strategy.evict(this.cacheStorage, cacheSizeToRemove);
        
        // 保存清理后的缓存
        this.saveCacheToData().catch(err => {
            this.logger.error('保存缓存数据失败:', err);
        });
    }
    
    /**
     * 停止定期清理
     */
    public stopPeriodicCleanup(): void {
        if (this.cleanupTimer !== null) {
            this.timerService.clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
    
    /**
     * 释放资源
     */
    public dispose(): void {
        this.stopPeriodicCleanup();
        this.cancelWarmupCache();
        
        // 保存缓存数据
        this.saveCacheToData().catch(err => {
            this.logger.error('保存缓存数据失败:', err);
        });
        
        // 释放引用
        this.cacheStorage.clear();
    }
} 