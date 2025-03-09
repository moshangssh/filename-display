import { 
    IFileDisplayCache, 
    IFilenameParser, 
    IFileExplorerDisplayService, 
    IFileProcessorService, 
    IMarkdownLinkService, 
    IEditorLinkDecorator, 
    IEventManagerService,
    IFileDisplayService
} from '../interfaces/IServices';
import { IFilenameDisplayPlugin } from '../../types';

/**
 * 依赖注入服务容器，负责管理所有服务实例
 */
export class ServiceContainer {
    private static instance: ServiceContainer;
    private services: Map<string, any> = new Map();
    private plugin: IFilenameDisplayPlugin;

    private constructor(plugin: IFilenameDisplayPlugin) {
        this.plugin = plugin;
    }

    /**
     * 获取服务容器单例
     */
    public static getInstance(plugin?: IFilenameDisplayPlugin): ServiceContainer {
        if (!ServiceContainer.instance && plugin) {
            ServiceContainer.instance = new ServiceContainer(plugin);
        }
        return ServiceContainer.instance;
    }

    /**
     * 注册服务实例
     */
    public register<T>(serviceType: string, instance: T): void {
        this.services.set(serviceType, instance);
    }

    /**
     * 获取服务实例
     */
    public get<T>(serviceType: string): T {
        const service = this.services.get(serviceType);
        if (!service) {
            throw new Error(`服务 ${serviceType} 未注册`);
        }
        return service as T;
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
    public getPlugin(): IFilenameDisplayPlugin {
        return this.plugin;
    }

    /**
     * 清理所有服务
     */
    public dispose(): void {
        // 按顺序清理，确保依赖关系正确处理
        const serviceTypes = [
            'EditorLinkDecorator',
            'EventManagerService',
            'MarkdownLinkService',
            'FileProcessorService',
            'FileExplorerDisplayService',
            'FileDisplayCache',
            'FilenameParser',
            'FileDisplayService'
        ];

        for (const serviceType of serviceTypes) {
            const service = this.services.get(serviceType);
            if (service && typeof service.dispose === 'function') {
                try {
                    service.dispose();
                } catch (error) {
                    console.error(`清理服务 ${serviceType} 时出错:`, error);
                }
            }
        }

        this.services.clear();
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
    ErrorHandler: 'ErrorHandler'
}; 