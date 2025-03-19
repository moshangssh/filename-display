import { 
    IFileDisplayCache, 
    IFilenameParser, 
    IFileExplorerDisplayService, 
    IFileProcessorService, 
    IMarkdownLinkService, 
    IEditorLinkDecorator, 
    IEventManagerService,
    IFileDisplayService,
    ILoggerService,
    ITimerService
} from '../interfaces/IServices';
import { ITitleExtractorPlugin } from '../../types';

/**
 * 依赖类型定义
 */
type ServiceFactory<T> = (container: ServiceContainer) => T;
type ServiceEntry<T> = {
    instance?: T;
    factory?: ServiceFactory<T>;
    dependencies?: string[];
};

/**
 * 依赖注入服务容器，负责管理所有服务实例
 */
export class ServiceContainer {
    private static instance: ServiceContainer;
    private services: Map<string, ServiceEntry<any>> = new Map();
    private plugin: ITitleExtractorPlugin;
    private resolutionStack: string[] = []; // 用于检测循环依赖

    private constructor(plugin: ITitleExtractorPlugin) {
        this.plugin = plugin;
    }

    /**
     * 获取服务容器单例
     */
    public static getInstance(plugin?: ITitleExtractorPlugin): ServiceContainer {
        if (!ServiceContainer.instance && plugin) {
            ServiceContainer.instance = new ServiceContainer(plugin);
        }
        return ServiceContainer.instance;
    }

    /**
     * 注册服务实例
     */
    public register<T>(serviceType: string, instance: T): void {
        this.services.set(serviceType, { instance });
    }

    /**
     * 注册服务工厂函数和依赖
     */
    public registerFactory<T>(
        serviceType: string, 
        factory: ServiceFactory<T>,
        dependencies: string[] = []
    ): void {
        this.services.set(serviceType, { 
            factory,
            dependencies
        });
    }

    /**
     * 获取服务实例，如果实例不存在会通过工厂函数创建
     */
    public get<T>(serviceType: string): T {
        // 检测循环依赖
        if (this.resolutionStack.includes(serviceType)) {
            const cycle = [...this.resolutionStack, serviceType].join(" -> ");
            throw new Error(`检测到循环依赖: ${cycle}`);
        }

        const entry = this.services.get(serviceType);
        if (!entry) {
            throw new Error(`服务 ${serviceType} 未注册`);
        }

        // 如果已经有实例，直接返回
        if (entry.instance) {
            return entry.instance as T;
        }

        // 记录当前解析路径，用于检测循环依赖
        this.resolutionStack.push(serviceType);

        try {
            if (entry.factory) {
                // 创建实例
                const instance = entry.factory(this);
                // 缓存实例
                entry.instance = instance;
                return instance as T;
            } else {
                throw new Error(`服务 ${serviceType} 没有实例或工厂函数`);
            }
        } finally {
            // 无论成功失败，移除当前服务类型
            this.resolutionStack.pop();
        }
    }

    /**
     * 检查服务是否已注册
     */
    public has(serviceType: string): boolean {
        return this.services.has(serviceType);
    }

    /**
     * 获取插件实例
     */
    public getPlugin(): ITitleExtractorPlugin {
        return this.plugin;
    }

    /**
     * 清理所有服务
     */
    public dispose(): void {
        // 按顺序清理，确保依赖关系正确处理
        const serviceTypes = [
            SERVICE_TYPES.EditorLinkDecorator,
            SERVICE_TYPES.EventManagerService,
            SERVICE_TYPES.MarkdownLinkService,
            SERVICE_TYPES.FileProcessorService,
            SERVICE_TYPES.FileExplorerDisplayService,
            SERVICE_TYPES.FileDisplayCache,
            SERVICE_TYPES.FilenameParser,
            SERVICE_TYPES.FileDisplayService,
            SERVICE_TYPES.TimerService,
            SERVICE_TYPES.LoggerService,
            SERVICE_TYPES.ExtensionCacheService,
            SERVICE_TYPES.LinkStateManager
        ];

        // 先获取关键服务
        const loggerService = this.services.get(SERVICE_TYPES.LoggerService)?.instance;
        const logger = loggerService ? loggerService.getLogger('ServiceContainer') : console;
        
        logger.log('开始清理所有服务资源...');
        
        const results: Record<string, boolean> = {};

        // 按顺序清理每个服务
        for (const serviceType of serviceTypes) {
            const entry = this.services.get(serviceType);
            const service = entry?.instance;
            
            if (service) {
                try {
                    if (typeof service.dispose === 'function') {
                        service.dispose();
                        results[serviceType] = true;
                    } else {
                        logger.warn(`服务 ${serviceType} 没有实现 dispose 方法`);
                        results[serviceType] = false;
                    }
                } catch (error) {
                    logger.error(`清理服务 ${serviceType} 时出错:`, error);
                    results[serviceType] = false;
                }
            }
        }
        
        // 检查是否有服务没有被清理
        const remainingServices = Array.from(this.services.keys())
            .filter(type => !serviceTypes.includes(type));
            
        if (remainingServices.length > 0) {
            logger.warn(`以下服务没有被明确清理: ${remainingServices.join(', ')}`);
            
            // 尝试清理这些服务
            for (const serviceType of remainingServices) {
                const entry = this.services.get(serviceType);
                const service = entry?.instance;
                
                if (service && typeof service.dispose === 'function') {
                    try {
                        service.dispose();
                        results[serviceType] = true;
                    } catch (error) {
                        logger.error(`清理额外服务 ${serviceType} 时出错:`, error);
                        results[serviceType] = false;
                    }
                }
            }
        }

        // 清空服务容器
        this.services.clear();
        
        logger.log('所有服务资源清理完成', results);
    }
}

// 服务类型常量，避免字符串错误
export const SERVICE_TYPES = {
    FilenameParser: 'FilenameParser',
    FileDisplayCache: 'FileDisplayCache',
    FileExplorerDisplayService: 'FileExplorerDisplayService',
    FileProcessorService: 'FileProcessorService',
    MarkdownLinkService: 'MarkdownLinkService',
    EditorLinkDecorator: 'EditorLinkDecorator',
    EventManagerService: 'EventManagerService',
    FileDisplayService: 'FileDisplayService',
    TimerService: 'TimerService',
    ErrorHandler: 'ErrorHandler',
    LoggerService: 'LoggerService',
    ExtensionCacheService: 'ExtensionCacheService',
    LinkStateManager: 'LinkStateManager',
    LinkDecorationExtensionProvider: 'LinkDecorationExtensionProvider'
}; 