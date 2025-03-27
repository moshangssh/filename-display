import { ILoggerService } from './interfaces/IServices';

/**
 * DOM缓存项接口
 */
interface DOMCacheItem {
    element: HTMLElement;
    lastAccessed: number;
    createTime: number;
}

/**
 * DOM缓存配置接口
 */
interface DOMCacheConfig {
    maxSize: number;           // 最大缓存项数量
    ttl: number;              // 缓存项生存时间（毫秒）
    cleanupInterval: number;   // 清理间隔（毫秒）
}

/**
 * DOM缓存管理器
 * 
 * 负责管理DOM元素的缓存，优化DOM查询性能。
 * 
 * 主要功能：
 * 1. 缓存常用的DOM元素
 * 2. 自动清理过期缓存
 * 3. 维护缓存大小
 * 4. 提供高效的查询接口
 */
export class DOMCacheManager {
    private cache: Map<string, DOMCacheItem> = new Map();
    private cleanupTimer: NodeJS.Timeout | null = null;
    
    // 默认配置
    private readonly defaultConfig: DOMCacheConfig = {
        maxSize: 1000,        // 默认最多缓存1000个元素
        ttl: 300000,         // 默认5分钟过期
        cleanupInterval: 60000 // 默认每分钟清理一次
    };

    constructor(
        private config: Partial<DOMCacheConfig>,
        private logger: ILoggerService
    ) {
        this.config = { ...this.defaultConfig, ...config };
        this.startCleanupTimer();
    }

    /**
     * 获取缓存的元素
     */
    public get(key: string): HTMLElement | null {
        const item = this.cache.get(key);
        if (!item) return null;

        // 检查是否过期
        if (this.isExpired(item)) {
            this.cache.delete(key);
            return null;
        }

        // 更新最后访问时间
        item.lastAccessed = Date.now();
        return item.element;
    }

    /**
     * 设置缓存
     */
    public set(key: string, element: HTMLElement): void {
        // 如果缓存已满，清理最旧的项目
        if (this.cache.size >= (this.config.maxSize || this.defaultConfig.maxSize)) {
            this.removeOldestItem();
        }

        this.cache.set(key, {
            element,
            lastAccessed: Date.now(),
            createTime: Date.now()
        });
    }

    /**
     * 批量设置缓存
     */
    public setMany(items: { key: string; element: HTMLElement }[]): void {
        for (const item of items) {
            this.set(item.key, item.element);
        }
    }

    /**
     * 删除缓存
     */
    public delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * 清空缓存
     */
    public clear(): void {
        this.cache.clear();
    }

    /**
     * 获取缓存大小
     */
    public size(): number {
        return this.cache.size;
    }

    /**
     * 检查缓存项是否存在
     */
    public has(key: string): boolean {
        const item = this.cache.get(key);
        if (!item) return false;

        // 如果已过期，删除并返回false
        if (this.isExpired(item)) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * 获取或创建缓存项
     */
    public getOrCreate(key: string, creator: () => HTMLElement | null): HTMLElement | null {
        let element = this.get(key);
        if (!element) {
            element = creator();
            if (element) {
                this.set(key, element);
            }
        }
        return element;
    }

    /**
     * 检查缓存项是否过期
     */
    private isExpired(item: DOMCacheItem): boolean {
        const ttl = this.config.ttl || this.defaultConfig.ttl;
        return Date.now() - item.createTime > ttl;
    }

    /**
     * 移除最旧的缓存项
     */
    private removeOldestItem(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        for (const [key, item] of this.cache.entries()) {
            if (item.lastAccessed < oldestTime) {
                oldestTime = item.lastAccessed;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }

    /**
     * 启动清理定时器
     */
    private startCleanupTimer(): void {
        const interval = this.config.cleanupInterval || this.defaultConfig.cleanupInterval;
        
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, interval);
    }

    /**
     * 清理过期的缓存项
     */
    private cleanup(): void {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, item] of this.cache.entries()) {
            if (this.isExpired(item)) {
                this.cache.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.logger.debug(`清理了 ${cleanedCount} 个过期的DOM缓存项`);
        }
    }

    /**
     * 销毁缓存管理器
     */
    public dispose(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.clear();
    }
} 