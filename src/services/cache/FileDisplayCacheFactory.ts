import { ITitleExtractorPlugin } from '../../types';
import { ILoggerService, ITimerService, IFileProcessorService } from '../interfaces/IServices';
import { FileDisplayCache } from './FileDisplayCache';
import { FileCacheStorage } from './storage/FileCacheStorage';
import { WeakMapElementAssociator } from './associator/WeakMapElementAssociator';
import { CacheMetadataManager } from './metadata/CacheMetadataManager';
import { ObsidianPersistenceManager } from './persistence/ObsidianPersistenceManager';
import { ProgressiveCacheWarmer } from './warmer/ProgressiveCacheWarmer';
import { IFileDisplayCache, FileCacheItem, CacheData, IPersistenceManager } from './interfaces';
import { ServiceContainer } from '../../core/ServiceContainer';

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
     * @param fileProcessorService 文件处理服务（可选，不推荐直接传入）
     * @returns FileDisplayCache实例
     */
    public static createFileDisplayCache(
        plugin: ITitleExtractorPlugin,
        loggerService: ILoggerService,
        timerService: ITimerService,
        fileProcessorService?: IFileProcessorService
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
        
        // 创建缓存预热器 - 不直接传入处理服务，而是通过服务容器延迟获取
        const cacheWarmer = new ProgressiveCacheWarmer(
            plugin,
            loggerService,
            timerService
            // 移除传入的 fileProcessorService 参数，改为通过服务容器获取
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
    
    /**
     * 通过服务容器创建或获取FileDisplayCache实例
     * 实现延迟初始化和依赖处理
     */
    public static getOrCreateFromContainer(
        plugin: ITitleExtractorPlugin
    ): IFileDisplayCache {
        const container = ServiceContainer.getInstance();
        
        // 如果容器中已存在缓存服务，直接返回
        if (container.has('fileDisplayCache')) {
            return container.get<IFileDisplayCache>('fileDisplayCache');
        }
        
        // 获取必要的依赖服务
        const loggerService = container.has('loggerService') 
            ? container.get<ILoggerService>('loggerService')
            : undefined;
            
        const timerService = container.has('timerService')
            ? container.get<ITimerService>('timerService')
            : undefined;
        
        if (!loggerService || !timerService) {
            throw new Error('创建FileDisplayCache失败: 缺少必要的依赖服务');
        }
        
        // 创建缓存并注册到容器
        const cache = this.createFileDisplayCache(plugin, loggerService, timerService);
        container.register('fileDisplayCache', cache);
        
        return cache;
    }
} 