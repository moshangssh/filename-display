import { ICacheMetadataManager, FileCacheItem } from '../interfaces';
import { ICacheStorage } from '../interfaces';

/**
 * 缓存元数据管理器
 * 负责管理缓存项的元数据，如访问时间、访问计数等
 */
export class CacheMetadataManager implements ICacheMetadataManager {
    private readonly CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟缓存过期
    private readonly HIGH_PRIORITY_EXPIRY = 30 * 60 * 1000; // 高优先级项30分钟过期

    /**
     * 构造函数
     * @param cacheStorage 缓存存储实例
     */
    constructor(private cacheStorage: ICacheStorage<string, FileCacheItem>) {}

    /**
     * 更新访问时间
     * @param key 文件路径
     */
    public updateAccessTime(key: string): void {
        const item = this.cacheStorage.get(key);
        if (item) {
            item.timestamp = Date.now();
        }
    }

    /**
     * 增加访问计数
     * @param key 文件路径
     */
    public incrementAccessCount(key: string): void {
        const item = this.cacheStorage.get(key);
        if (item) {
            item.accessCount++;
        }
    }

    /**
     * 设置优先级
     * @param key 文件路径
     * @param isPriority 是否为高优先级
     */
    public setPriority(key: string, isPriority: boolean): void {
        const item = this.cacheStorage.get(key);
        if (item) {
            item.priority = isPriority;
        }
    }

    /**
     * 检查缓存项是否过期
     * @param key 文件路径
     * @returns 是否过期
     */
    public isExpired(key: string): boolean {
        const item = this.cacheStorage.get(key);
        if (!item) return true;

        const now = Date.now();
        const expiryTime = item.priority ? this.HIGH_PRIORITY_EXPIRY : this.CACHE_EXPIRY;
        return now - item.timestamp > expiryTime;
    }

    /**
     * 设置过期时间配置
     * @param normalExpiry 普通项过期时间（毫秒）
     * @param priorityExpiry 高优先级项过期时间（毫秒）
     */
    public setExpiryTimes(normalExpiry: number, priorityExpiry: number): void {
        (this as any).CACHE_EXPIRY = normalExpiry;
        (this as any).HIGH_PRIORITY_EXPIRY = priorityExpiry;
    }
} 