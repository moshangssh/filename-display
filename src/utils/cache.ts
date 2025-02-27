import { TFile } from 'obsidian';

interface CacheOptions {
    maxSize?: number;
    expireTime?: number;
    onEvict?: (key: string, value: any) => void;
}

interface CacheStats {
    hits: number;
    misses: number;
    size: number;
    itemCount: number;
    lastCleanup: number;
}

/**
 * 通用缓存管理器
 * 支持内存缓存和可选的持久化
 */
export class Cache<T = any> {
    private static instances = new Map<string, Cache>();
    private cache = new Map<string, { value: T; timestamp: number }>();
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        size: 0,
        itemCount: 0,
        lastCleanup: Date.now()
    };

    private constructor(
        private readonly name: string,
        private readonly options: CacheOptions = {}
    ) {
        this.options = {
            maxSize: 100 * 1024 * 1024, // 默认100MB
            expireTime: 5 * 60 * 1000,  // 默认5分钟
            ...options
        };
    }

    /**
     * 获取缓存实例
     */
    public static getInstance<T>(name: string, options?: CacheOptions): Cache<T> {
        if (!Cache.instances.has(name)) {
            Cache.instances.set(name, new Cache<T>(name, options));
        }
        return Cache.instances.get(name) as Cache<T>;
    }

    /**
     * 获取缓存项
     */
    public get(key: string): T | undefined {
        const item = this.cache.get(key);
        if (!item) {
            this.stats.misses++;
            return undefined;
        }

        if (this.isExpired(item.timestamp)) {
            this.delete(key);
            this.stats.misses++;
            return undefined;
        }

        this.stats.hits++;
        return item.value;
    }

    /**
     * 设置缓存项
     */
    public set(key: string, value: T): void {
        const oldItem = this.cache.get(key);
        if (oldItem) {
            this.stats.size -= this.estimateSize(oldItem.value);
        }

        const newSize = this.estimateSize(value);
        if (this.stats.size + newSize > this.options.maxSize!) {
            this.cleanup();
        }

        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });

        this.stats.size += newSize;
        this.stats.itemCount = this.cache.size;
    }

    /**
     * 删除缓存项
     */
    public delete(key: string): void {
        const item = this.cache.get(key);
        if (item) {
            this.stats.size -= this.estimateSize(item.value);
            this.cache.delete(key);
            this.stats.itemCount = this.cache.size;
            this.options.onEvict?.(key, item.value);
        }
    }

    /**
     * 清理过期和超量的缓存项
     */
    public cleanup(): void {
        const now = Date.now();
        let cleanupCount = 0;
        let freedSize = 0;

        for (const [key, item] of this.cache) {
            if (this.isExpired(item.timestamp) || 
                this.stats.size > this.options.maxSize!) {
                const itemSize = this.estimateSize(item.value);
                this.delete(key);
                cleanupCount++;
                freedSize += itemSize;
            }
        }

        if (cleanupCount > 0) {
            console.log(`[${this.name}] 缓存清理: 移除了 ${cleanupCount} 项, 释放 ${(freedSize/1024/1024).toFixed(2)}MB`);
        }

        this.stats.lastCleanup = now;
    }

    /**
     * 清空缓存
     */
    public clear(): void {
        this.cache.clear();
        this.stats = {
            hits: 0,
            misses: 0,
            size: 0,
            itemCount: 0,
            lastCleanup: Date.now()
        };
    }

    /**
     * 获取缓存统计信息
     */
    public getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * 检查缓存项是否过期
     */
    private isExpired(timestamp: number): boolean {
        return Date.now() - timestamp > this.options.expireTime!;
    }

    /**
     * 估算对象大小（字节）
     */
    private estimateSize(value: any): number {
        if (value instanceof TFile) {
            return value.stat.size;
        }
        return JSON.stringify(value).length * 2; // 粗略估算
    }
} 