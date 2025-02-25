import { TFile } from 'obsidian';
import { FileCacheItem, CacheStats, CacheManager } from '../types/interfaces';

export class DefaultCacheManager implements CacheManager {
    private fileCache: Map<string, FileCacheItem> = new Map();
    private readonly CACHE_EXPIRE_TIME = 5 * 60 * 1000;
    
    private cacheStats: CacheStats = {
        totalSize: 0,
        itemCount: 0,
        lastCleanup: Date.now()
    };

    addToCache(path: string, files: TFile[]): void {
        const now = Date.now();
        const cacheItem: FileCacheItem = {
            files,
            timestamp: now
        };
        
        this.fileCache.set(path, cacheItem);
        this.updateCacheStats(cacheItem);
    }

    getFromCache(path: string): FileCacheItem | undefined {
        return this.fileCache.get(path);
    }

    clearCache(path?: string): void {
        if (path) {
            this.fileCache.delete(path);
        } else {
            this.fileCache.clear();
        }
    }

    getCacheStats(): CacheStats {
        return { ...this.cacheStats };
    }

    private updateCacheStats(item: FileCacheItem): void {
        this.cacheStats.itemCount++;
        this.cacheStats.totalSize += this.estimateItemSize(item);
    }

    private estimateItemSize(item: FileCacheItem): number {
        return 40 + (item.files.length * 32) + 8;
    }
}
