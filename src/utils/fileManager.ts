import { TFile, TFolder, normalizePath } from 'obsidian';
import { FileCacheItem, FileDisplayPluginSettings } from '../types';
import { App } from 'obsidian';
import { CacheManager } from '../utils/cacheManager';

export class FileManager {
    private fileCache: Map<string, FileCacheItem> = new Map();
    private weakFileRefs = new WeakMap<TFile, number>();
    private cacheStats = {
        totalSize: 0,
        itemCount: 0,
        lastCleanup: Date.now()
    };
    private readonly CACHE_EXPIRE_TIME = 5 * 60 * 1000; // 5分钟过期
    private settings: FileDisplayPluginSettings;

    constructor(
        private app: App,
        private cacheManager: CacheManager,
        settings: FileDisplayPluginSettings
    ) {
        this.settings = settings;
    }

    // 获取文件夹下所有文件
    async getAllFiles(folder: TFolder): Promise<TFile[]> {
        try {
            const now = Date.now();
            const cacheItem = this.fileCache.get(folder.path);
            
            if (cacheItem && (now - cacheItem.timestamp) < this.CACHE_EXPIRE_TIME) {
                return cacheItem.files;
            }
            
            const files: TFile[] = [];
            
            // 使用迭代器进行分批处理
            const processFiles = async (folder: TFolder) => {
                let batch: TFile[] = [];
                
                const processBatch = async () => {
                    if (batch.length > 0) {
                        files.push(...batch);
                        batch = [];
                        // 让出主线程
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                };
                
                for (const child of folder.children) {
                    if (child instanceof TFile) {
                        batch.push(child);
                        this.weakFileRefs.set(child, now);
                        
                        if (batch.length >= this.settings.batchSize) {
                            await processBatch();
                        }
                    } else if (child instanceof TFolder) {
                        await processBatch(); // 处理当前批次
                        await processFiles(child);
                    }
                }
                
                await processBatch(); // 处理剩余文件
            };
            
            await processFiles(folder);
            
            // 更新缓存和统计
            const itemSize = this.estimateItemSize({files, timestamp: now});
            this.cacheStats.totalSize += itemSize;
            this.cacheStats.itemCount++;
            
            this.fileCache.set(folder.path, {
                files,
                timestamp: now
            });
            
            return files;
        } catch (error) {
            console.error('[Filename Display] Failed to get files:', error);
            return [];
        }
    }

    // 清理缓存
    cleanupCache() {
        try {
            const now = Date.now();
            let cleanupCount = 0;
            let freedSize = 0;
            
            // 时间和大小双重检查
            for (const [path, cacheItem] of this.fileCache) {
                const isExpired = now - cacheItem.timestamp > this.CACHE_EXPIRE_TIME;
                const itemSize = this.estimateItemSize(cacheItem);
                
                if (isExpired || this.cacheStats.totalSize + itemSize > this.settings.maxCacheSize * 1024 * 1024) {
                    this.fileCache.delete(path);
                    this.cacheStats.totalSize -= itemSize;
                    this.cacheStats.itemCount--;
                    cleanupCount++;
                    freedSize += itemSize;
                }
            }
            
            if (cleanupCount > 0) {
                console.log(`[Filename Display] Cache cleanup: removed ${cleanupCount} items, freed ${(freedSize/1024/1024).toFixed(2)}MB`);
            }
            
            this.cacheStats.lastCleanup = now;
        } catch (error) {
            console.error('[Filename Display] Cache cleanup failed:', error);
        }
    }

    // 清除指定文件夹的缓存
    clearFolderCache(folderPath: string) {
        if (folderPath) {
            const normalizedPath = normalizePath(folderPath);
            this.fileCache.delete(normalizedPath);
        }
    }

    // 获取缓存统计
    getCacheStats() {
        return {
            itemCount: this.cacheStats.itemCount,
            totalSize: this.cacheStats.totalSize
        };
    }

    // 估算缓存项大小
    private estimateItemSize(item: FileCacheItem): number {
        // 基础结构大小
        let size = 40; // Map entry overhead
        
        // 文件引用大小
        size += item.files.length * 32; // 每个TFile引用约32字节
        
        // 时间戳大小
        size += 8;
        
        return size;
    }
} 