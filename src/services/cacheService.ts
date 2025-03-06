/**
 * LRU 缓存服务
 * 提供独立的缓存管理逻辑，可在多个组件间共享
 */
export class CacheService<K, V> {
    private cache: Map<K, V>;
    private timestamps: Map<K, number>;
    private readonly maxSize: number;
    private hits: number = 0;
    private misses: number = 0;
    
    constructor(maxSize: number) {
        this.maxSize = maxSize;
        this.cache = new Map();
        this.timestamps = new Map();
    }
    
    /**
     * 设置缓存项
     */
    public set(key: K, value: V): void {
        this.timestamps.set(key, Date.now());
        
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }
        
        this.cache.set(key, value);
    }
    
    /**
     * 获取缓存项
     */
    public get(key: K): V | null {
        const value = this.cache.get(key);
        if (value !== undefined) {
            this.hits++;
            this.timestamps.set(key, Date.now());
            return value;
        }
        this.misses++;
        return null;
    }
    
    /**
     * 移除最旧的缓存项
     */
    private evictOldest(): void {
        let oldestKey: K | null = null;
        let oldestTime = Infinity;
        
        for (const [key, time] of this.timestamps) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.timestamps.delete(oldestKey);
        }
    }
    
    /**
     * 检查键是否存在
     */
    public has(key: K): boolean {
        return this.cache.has(key);
    }
    
    /**
     * 获取所有缓存的键
     */
    public keys(): K[] {
        return Array.from(this.cache.keys());
    }
    
    /**
     * 获取所有缓存的值
     */
    public values(): V[] {
        return Array.from(this.cache.values());
    }
    
    /**
     * 获取缓存项数量
     */
    public size(): number {
        return this.cache.size;
    }
    
    /**
     * 清空缓存
     */
    public clear(): void {
        this.cache.clear();
        this.timestamps.clear();
        this.hits = 0;
        this.misses = 0;
    }
    
    /**
     * 获取缓存统计信息
     */
    public getStats(): { hits: number; misses: number; hitRate: number; size: number; maxSize: number } {
        const total = this.hits + this.misses;
        return {
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? this.hits / total : 0,
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }
} 