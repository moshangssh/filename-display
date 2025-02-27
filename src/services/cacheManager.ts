import { TFile } from 'obsidian';

/**
 * 缓存管理器配置接口
 */
export interface CacheManagerConfig {
    maxCacheSize: number;        // 最大缓存大小(MB)
    expireTime: number;          // 缓存过期时间(ms)
    cleanupInterval: number;     // 清理间隔(ms)
}

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
    private indexCache: Map<string, {
        files: Map<string, {
            path: string;
            lastModified: number;
        }>;
        timestamp: number;
    }> = new Map();
    private weakFileRefs = new WeakMap<TFile, number>();
    private cacheStats: CacheStats = {
        totalSize: 0,
        itemCount: 0,
        lastCleanup: Date.now()
    };
    
    constructor(private config: CacheManagerConfig) {
        // 定期清理过期缓存
        setInterval(() => this.cleanup(), this.config.cleanupInterval);
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
    public clearCache(path?: string): void {
        if (path) {
            const cacheItem = this.fileCache.get(path);
            if (cacheItem) {
                const itemSize = this.estimateItemSize(cacheItem);
                this.cacheStats.totalSize -= itemSize;
                this.cacheStats.itemCount--;
                this.fileCache.delete(path);
            }
        } else {
            this.clearAllCache(); // 清空所有缓存
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
        const now = Date.now();
        
        // 清理文件缓存
        for (const [path, item] of this.fileCache.entries()) {
            if (now - item.timestamp > this.config.expireTime) {
                const itemSize = this.estimateItemSize(item);
                this.cacheStats.totalSize -= itemSize;
                this.cacheStats.itemCount--;
                this.fileCache.delete(path);
            }
        }
        
        // 清理索引缓存
        for (const [path, item] of this.indexCache.entries()) {
            if (now - item.timestamp > this.config.expireTime) {
                this.indexCache.delete(path);
            }
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

    /**
     * 更新文件索引
     */
    public updateFileIndex(folderPath: string, files: TFile[]): void {
        const now = Date.now();
        const fileMap = new Map();
        
        files.forEach(file => {
            fileMap.set(file.path, {
                path: file.path,
                lastModified: file.stat.mtime
            });
        });
        
        this.indexCache.set(folderPath, {
            files: fileMap,
            timestamp: now
        });
    }

    /**
     * 获取文件索引
     */
    public getFileIndex(folderPath: string) {
        const indexItem = this.indexCache.get(folderPath);
        if (!indexItem) return null;
        
        const now = Date.now();
        if (now - indexItem.timestamp > this.config.expireTime) {
            this.indexCache.delete(folderPath);
            return null;
        }
        
        return indexItem.files;
    }
}  
