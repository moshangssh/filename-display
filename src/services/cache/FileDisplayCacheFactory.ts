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
import { DependencyResolver } from '../../core/DependencyResolver';

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
        
        // 创建缓存预热器
        const cacheWarmer = new ProgressiveCacheWarmer(
            plugin, 
            loggerService, 
            timerService
            // 不再传递fileProcessorService，以避免循环依赖
        );
        
        // 创建并返回文件显示缓存
        const fileDisplayCache = new FileDisplayCache(
            plugin,
            cacheStorage,
            elementAssociator,
            metadataManager,
            persistenceManager,
            cacheWarmer,
            loggerService,
            timerService
        );
        
        return fileDisplayCache;
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
        
        // 使用依赖解析器
        const resolver = new DependencyResolver();
        
        // 定义依赖项
        const dependencies = ['loggerService', 'timerService'];
        
        // 等待依赖项就绪后创建缓存
        resolver.whenReady(dependencies, (loggerService, timerService) => {
            if (!loggerService || !timerService) {
                throw new Error('创建FileDisplayCache失败: 缺少必要的依赖服务');
            }
            
            // 创建缓存并注册到容器
            const cache = this.createFileDisplayCache(plugin, loggerService, timerService);
            container.register('fileDisplayCache', cache);
            
            return cache;
        });
        
        // 注册缓存的参数化工厂函数
        container.registerParameterizedFactory('createFileDisplayCache', 
            (pluginInstance, logger, timer) => {
                return this.createFileDisplayCache(
                    pluginInstance,
                    logger,
                    timer
                );
            }
        );
        
        // 如果此时缓存已创建，返回它
        if (container.has('fileDisplayCache')) {
            return container.get<IFileDisplayCache>('fileDisplayCache');
        }
        
        // 否则强制创建并注册
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