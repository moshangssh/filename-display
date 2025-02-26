import { TFile } from 'obsidian';

/**
 * 缓存项接口
 */
export interface CacheItem<T> {
    data: T;
    timestamp: number;
}

/**
 * 缓存配置接口
 */
export interface CacheConfig {
    maxCacheSize: number;     // 最大缓存大小(MB)
    expireTime: number;       // 缓存过期时间(毫秒)
    cleanupInterval: number;  // 清理间隔(毫秒)
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
    itemCount: number;        // 缓存项数量
    totalSize: number;        // 估计的总大小(字节)
    lastCleanup: number;      // 上次清理时间戳
}

/**
 * 缓存管理器类
 * 负责管理文件缓存，提供缓存获取、设置和清理功能
 */
export class CacheManager {
    private fileCache: Map<string, CacheItem<TFile[]>> = new Map();
    private weakFileRefs = new WeakMap<TFile, number>();
    private cacheStats: CacheStats = {
        totalSize: 0,
        itemCount: 0,
        lastCleanup: Date.now()
    };
    
    private config: CacheConfig = {
        maxCacheSize: 100,            // 默认100MB
        expireTime: 5 * 60 * 1000,    // 默认5分钟过期
        cleanupInterval: 10 * 60 * 1000 // 默认10分钟清理一次
    };
    
    constructor(config?: Partial<CacheConfig>) {
        if (config) {
            this.updateConfig(config);
        }
    }
    
    /**
     * 更新缓存配置
     */
    public updateConfig(config: Partial<CacheConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 获取缓存的文件列表
     * @param path 文件夹路径
     * @returns 缓存的文件列表或null
     */
    public getCachedFiles(path: string): TFile[] | null {
        const now = Date.now();
        const cacheItem = this.fileCache.get(path);
        
        // 检查缓存是否存在且未过期
        if (cacheItem && (now - cacheItem.timestamp) < this.config.expireTime) {
            return cacheItem.data;
        }
        
        return null;
    }
    
    /**
     * 设置缓存的文件列表
     * @param path 文件夹路径
     * @param files 文件列表
     */
    public setCachedFiles(path: string, files: TFile[]): void {
        const now = Date.now();
        const cacheItem: CacheItem<TFile[]> = {
            data: files,
            timestamp: now
        };
        
        // 记录文件引用时间
        files.forEach(file => {
            this.weakFileRefs.set(file, now);
        });
        
        // 更新缓存和统计
        const itemSize = this.estimateItemSize(cacheItem);
        this.cacheStats.totalSize += itemSize;
        this.cacheStats.itemCount++;
        
        this.fileCache.set(path, cacheItem);
        
        // 检查是否需要清理缓存
        if (this.cacheStats.totalSize > this.config.maxCacheSize * 1024 * 1024) {
            this.cleanup();
        }
    }
    
    /**
     * 清理指定路径的缓存
     * @param path 文件夹路径
     */
    public clearPathCache(path: string): void {
        const cacheItem = this.fileCache.get(path);
        if (cacheItem) {
            const itemSize = this.estimateItemSize(cacheItem);
            this.cacheStats.totalSize -= itemSize;
            this.cacheStats.itemCount--;
            this.fileCache.delete(path);
        }
    }
    
    /**
     * 清空所有缓存
     */
    public clearAllCache(): void {
        this.fileCache.clear();
        this.cacheStats = {
            totalSize: 0,
            itemCount: 0,
            lastCleanup: Date.now()
        };
    }
    
    /**
     * 获取缓存统计信息
     */
    public getStats(): CacheStats {
        return { ...this.cacheStats };
    }
    
    /**
     * 缓存清理
     * 移除过期或过大的缓存项
     */
    public cleanup(): void {
        try {
            const now = Date.now();
            let cleanupCount = 0;
            let freedSize = 0;
            
            // 使用数组存储待删除的缓存项
            const toDelete: string[] = [];
            
            // 时间和大小双重检查
            for (const [path, cacheItem] of this.fileCache) {
                const isExpired = now - cacheItem.timestamp > this.config.expireTime;
                const itemSize = this.estimateItemSize(cacheItem);
                
                if (isExpired || this.cacheStats.totalSize > this.config.maxCacheSize * 1024 * 1024) {
                    toDelete.push(path);
                    this.cacheStats.totalSize -= itemSize;
                    this.cacheStats.itemCount--;
                    cleanupCount++;
                    freedSize += itemSize;
                }
            }
            
            // 批量删除缓存项
            for (const path of toDelete) {
                this.fileCache.delete(path);
            }
            
            if (cleanupCount > 0) {
                console.log(`[文件名显示] 缓存清理: 移除了 ${cleanupCount} 项, 释放 ${(freedSize/1024/1024).toFixed(2)}MB`);
            }
            
            this.cacheStats.lastCleanup = now;
        } catch (error) {
            console.error('[文件名显示] 缓存清理失败:', error);
        }
    }
    
    /**
     * 估算缓存项大小
     * @param item 缓存项
     * @returns 估计的大小(字节)
     */
    private estimateItemSize(item: CacheItem<TFile[]>): number {
        // 基础结构大小
        let size = 40; // Map入口开销
        
        // 文件引用大小
        size += item.data.length * 32; // 每个TFile引用约32字节
        
        // 时间戳大小
        size += 8;
        
        return size;
    }
}  
