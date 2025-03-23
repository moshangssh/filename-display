import { ITitleExtractorPlugin } from '../../types';
import { ILoggerService, ITimerService } from '../interfaces/IServices';
import { FileDisplayCache } from './FileDisplayCache';
import { FileCacheStorage } from './storage/FileCacheStorage';
import { WeakMapElementAssociator } from './associator/WeakMapElementAssociator';
import { CacheMetadataManager } from './metadata/CacheMetadataManager';
import { ObsidianPersistenceManager } from './persistence/ObsidianPersistenceManager';
import { ProgressiveCacheWarmer } from './warmer/ProgressiveCacheWarmer';
import { IFileDisplayCache, FileCacheItem, CacheData, IPersistenceManager } from './interfaces';
import { FileProcessorService } from '../FileProcessorService';

/**
 * 文件显示缓存工厂类
 * 负责创建FileDisplayCache实例并注入所有依赖
 */
export class FileDisplayCacheFactory {
    /**
     * 创建FileDisplayCache实例
     * @param plugin 插件实例
     * @param loggerService 日志服务
     * @param timerService 定时器服务
     * @param fileProcessorService 文件处理服务（可选）
     * @returns FileDisplayCache实例
     */
    public static createFileDisplayCache(
        plugin: ITitleExtractorPlugin,
        loggerService: ILoggerService,
        timerService: ITimerService,
        fileProcessorService?: FileProcessorService
    ): IFileDisplayCache {
        // 创建缓存存储
        const cacheStorage = new FileCacheStorage();
        
        // 创建元素关联器
        const elementAssociator = new WeakMapElementAssociator();
        
        // 创建缓存元数据管理器
        const metadataManager = new CacheMetadataManager(cacheStorage);
        
        // 创建持久化管理器
        const persistenceManager: IPersistenceManager<CacheData> = new ObsidianPersistenceManager(
            plugin, 
            loggerService
        );
        
        // 创建缓存预热器
        const cacheWarmer = new ProgressiveCacheWarmer(
            plugin,
            loggerService,
            timerService,
            fileProcessorService
        );
        
        // 创建文件显示缓存
        return new FileDisplayCache(
            cacheStorage,
            elementAssociator,
            metadataManager,
            persistenceManager,
            cacheWarmer,
            plugin,
            loggerService,
            timerService
        );
    }
} 