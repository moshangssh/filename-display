import { TFile } from 'obsidian';

/**
 * LRU缓存节点接口
 */
interface LRUNode<T> {
    key: string;
    value: T;
    prev: LRUNode<T> | null;
    next: LRUNode<T> | null;
    timestamp: number;
    size: number;
}

/**
 * LRU缓存实现
 */
class LRUCache<T> {
    private capacity: number;
    private cache: Map<string, LRUNode<T>>;
    private head: LRUNode<T>;
    private tail: LRUNode<T>;
    
    constructor(capacity: number) {
        this.capacity = capacity;
        this.cache = new Map();
        this.head = {} as LRUNode<T>;
        this.tail = {} as LRUNode<T>;
        this.head.next = this.tail;
        this.tail.prev = this.head;
    }
    
    private addNode(node: LRUNode<T>) {
        node.prev = this.head;
        node.next = this.head.next;
        this.head.next!.prev = node;
        this.head.next = node;
    }
    
    private removeNode(node: LRUNode<T>) {
        const prev = node.prev!;
        const next = node.next!;
        prev.next = next;
        next.prev = prev;
    }
    
    private moveToHead(node: LRUNode<T>) {
        this.removeNode(node);
        this.addNode(node);
    }
    
    private popTail(): LRUNode<T> {
        const node = this.tail.prev!;
        this.removeNode(node);
        return node;
    }
    
    public get(key: string): T | null {
        const node = this.cache.get(key);
        if (!node) return null;
        
        this.moveToHead(node);
        return node.value;
    }
    
    public set(key: string, value: T): void {
        let node = this.cache.get(key);
        
        if (node) {
            node.value = value;
            this.moveToHead(node);
        } else {
            const newNode: LRUNode<T> = {
                key,
                value,
                prev: null,
                next: null,
                timestamp: Date.now(),
                size: 0 // 由外部计算实际大小
            };
            
            this.cache.set(key, newNode);
            this.addNode(newNode);
            
            if (this.cache.size > this.capacity) {
                const tail = this.popTail();
                this.cache.delete(tail.key);
            }
        }
    }
    
    public delete(key: string): void {
        const node = this.cache.get(key);
        if (node) {
            this.removeNode(node);
            this.cache.delete(key);
        }
    }
    
    public clear(): void {
        this.cache.clear();
        this.head.next = this.tail;
        this.tail.prev = this.head;
    }
    
    public entries(): IterableIterator<[string, T]> {
        return new Map(
            Array.from(this.cache.entries()).map(([k, v]) => [k, v.value])
        ).entries();
    }
}

/**
 * 缓存层级
 */
enum CacheLevel {
    MEMORY,  // 内存缓存
    DISK     // 磁盘缓存
}

/**
 * 缓存管理器配置接口
 */
export interface CacheManagerConfig {
    maxMemoryCacheSize: number;    // 最大内存缓存大小(MB)
    maxDiskCacheSize: number;      // 最大磁盘缓存大小(MB) 
    expireTime: number;            // 缓存过期时间(ms)
    cleanupInterval: number;       // 清理间隔(ms)
    progressiveCleanupSize: number;// 每次渐进式清理的项数
}

/**
 * 缓存项接口
 */
export interface CacheItem<T> {
    data: T;
    timestamp: number;
    level: CacheLevel;
    size: number;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
    memoryItemCount: number;     // 内存缓存项数量
    diskItemCount: number;       // 磁盘缓存项数量
    memorySize: number;         // 内存使用大小(字节)
    diskSize: number;          // 磁盘使用大小(字节)
    lastCleanup: number;       // 上次清理时间戳
    hits: number;              // 缓存命中次数
    misses: number;            // 缓存未命中次数
}

/**
 * 缓存管理器类
 */
export class CacheManager {
    private memoryCache: LRUCache<CacheItem<TFile[]>>;
    private diskCache: LRUCache<CacheItem<TFile[]>>;
    private worker: Worker | null = null;
    
    private cacheStats: CacheStats = {
        memoryItemCount: 0,
        diskItemCount: 0,
        memorySize: 0,
        diskSize: 0,
        lastCleanup: Date.now(),
        hits: 0,
        misses: 0
    };

    constructor(private config: CacheManagerConfig) {
        this.memoryCache = new LRUCache<CacheItem<TFile[]>>(config.maxMemoryCacheSize);
        this.diskCache = new LRUCache<CacheItem<TFile[]>>(config.maxDiskCacheSize);
        
        // 初始化后台清理Worker
        this.initWorker();
        
        // 定期触发渐进式清理
        setInterval(() => this.progressiveCleanup(), this.config.cleanupInterval);
    }

    /**
     * 初始化后台清理Worker
     */
    private initWorker() {
        try {
            // 创建Worker代码
            const workerCode = `
                self.onmessage = (e) => {
                    const { keys, expireTime, level } = e.data;
                    const now = Date.now();
                    
                    // 查找过期的key
                    const expiredKeys = keys.filter(key => {
                        const timestamp = parseInt(key.split('_')[1] || '0');
                        return (now - timestamp) > expireTime;
                    });
                    
                    // 发送结果回主线程
                    self.postMessage({
                        expiredKeys,
                        level
                    });
                };
            `;
            
            // 创建Blob URL
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            
            // 创建Worker
            this.worker = new Worker(workerUrl);
            
            // 配置Worker消息处理
            this.worker.onmessage = (e) => {
                const { expiredKeys, level } = e.data;
                if (level === CacheLevel.MEMORY) {
                    expiredKeys.forEach((key: string) => this.memoryCache.delete(key));
                } else {
                    expiredKeys.forEach((key: string) => this.diskCache.delete(key));
                }
            };
            
            // 清理Blob URL
            URL.revokeObjectURL(workerUrl);
        } catch (error) {
            console.error('初始化Worker失败:', error);
            this.worker = null;
        }
    }

    /**
     * 触发Worker清理
     */
    private triggerWorkerCleanup(level: CacheLevel) {
        if (!this.worker) return;
        
        const cache = level === CacheLevel.MEMORY ? this.memoryCache : this.diskCache;
        const keys = Array.from(cache.entries()).map(([key]) => key);
        
        this.worker.postMessage({
            keys,
            expireTime: this.config.expireTime,
            level
        });
    }

    /**
     * 渐进式清理
     */
    public progressiveCleanup(): void {
        // 如果Worker可用，使用Worker进行清理
        if (this.worker) {
            this.triggerWorkerCleanup(CacheLevel.MEMORY);
            this.triggerWorkerCleanup(CacheLevel.DISK);
            return;
        }
        
        // 降级到同步清理
        const now = Date.now();
        let cleanedCount = 0;
        
        // 清理内存缓存
        for (const [key, item] of this.memoryCache.entries()) {
            if (cleanedCount >= this.config.progressiveCleanupSize) break;
            
            if (now - item.timestamp > this.config.expireTime) {
                this.memoryCache.delete(key);
                this.cacheStats.memoryItemCount--;
                this.cacheStats.memorySize -= item.size;
                cleanedCount++;
            }
        }
        
        // 清理磁盘缓存
        cleanedCount = 0;
        for (const [key, item] of this.diskCache.entries()) {
            if (cleanedCount >= this.config.progressiveCleanupSize) break;
            
            if (now - item.timestamp > this.config.expireTime) {
                this.diskCache.delete(key);
                this.cacheStats.diskItemCount--;
                this.cacheStats.diskSize -= item.size;
                cleanedCount++;
            }
        }
        
        this.cacheStats.lastCleanup = now;
    }

    /**
     * 获取缓存项
     */
    public get(key: string): TFile[] | null {
        // 先查找内存缓存
        let cacheItem = this.memoryCache.get(key);
        if (cacheItem) {
            this.cacheStats.hits++;
            return cacheItem.data;
        }
        
        // 再查找磁盘缓存
        cacheItem = this.diskCache.get(key);
        if (cacheItem) {
            this.cacheStats.hits++;
            // 提升到内存缓存
            const memoryCacheItem: CacheItem<TFile[]> = {
                ...cacheItem,
                level: CacheLevel.MEMORY
            };
            this.memoryCache.set(key, memoryCacheItem);
            this.diskCache.delete(key);
            return cacheItem.data;
        }
        
        this.cacheStats.misses++;
        return null;
    }

    /**
     * 设置缓存项
     */
    public set(key: string, value: TFile[]): void {
        const size = this.estimateItemSize(value);
        const now = Date.now();
        
        const cacheItem: CacheItem<TFile[]> = {
            data: value,
            timestamp: now,
            size: size,
            level: CacheLevel.MEMORY
        };
        
        // 如果大小适合内存缓存
        if (size <= this.config.maxMemoryCacheSize * 1024 * 1024) {
            this.memoryCache.set(key, cacheItem);
            this.cacheStats.memoryItemCount++;
            this.cacheStats.memorySize += size;
        } else {
            // 存入磁盘缓存
            cacheItem.level = CacheLevel.DISK;
            this.diskCache.set(key, cacheItem);
            this.cacheStats.diskItemCount++;
            this.cacheStats.diskSize += size;
        }
    }

    /**
     * 清理指定key的缓存
     */
    public clear(key?: string): void {
        if (key) {
            this.memoryCache.delete(key);
            this.diskCache.delete(key);
        } else {
            this.memoryCache.clear();
            this.diskCache.clear();
            this.resetStats();
        }
    }

    /**
     * 重置统计信息
     */
    private resetStats(): void {
        this.cacheStats = {
            memoryItemCount: 0,
            diskItemCount: 0,
            memorySize: 0,
            diskSize: 0,
            lastCleanup: Date.now(),
            hits: 0,
            misses: 0
        };
    }

    /**
     * 估算缓存项大小
     */
    private estimateItemSize(item: TFile[]): number {
        return item.reduce((size, file) => {
            return size + file.path.length * 2 + 32; // 基础结构开销
        }, 40); // Map条目基础开销
    }

    /**
     * 获取缓存统计信息
     */
    public getStats(): CacheStats {
        return { ...this.cacheStats };
    }
}  
