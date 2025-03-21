import { IPersistenceManager, CacheData } from '../interfaces';
import { ILoggerService } from '../../interfaces/IServices';
import { ITitleExtractorPlugin } from '../../../types';

/**
 * Obsidian持久化管理器
 * 负责将缓存数据保存到Obsidian的数据存储中
 */
export class ObsidianPersistenceManager implements IPersistenceManager<CacheData> {
    private readonly CACHE_KEY = 'filename-display-cache';
    
    /**
     * 构造函数
     * @param plugin Obsidian插件实例
     * @param logger 日志服务
     */
    constructor(
        private plugin: ITitleExtractorPlugin,
        private logger: ILoggerService
    ) {}
    
    /**
     * 保存数据到Obsidian存储
     * @param data 要保存的数据
     */
    public async save(data: CacheData): Promise<void> {
        try {
            // 使用正确的API方式保存数据
            await this.savePluginData(data);
            this.logger.debug(`已将 ${data.fileCache.length} 个缓存项保存到持久化存储`);
        } catch (error) {
            this.logger.error('保存缓存数据失败:', error);
        }
    }
    
    /**
     * 从Obsidian存储加载数据
     * @returns 加载的数据或空缓存数据
     */
    public async load(): Promise<CacheData | undefined> {
        try {
            // 使用正确的API方式加载数据
            const data = await this.loadPluginData();
            
            // 验证加载的数据格式是否有效
            if (data && typeof data === 'object' && Array.isArray(data.fileCache)) {
                this.logger.debug(`从持久化存储加载了 ${data.fileCache.length} 个缓存项`);
                return data;
            } else if (!data) {
                this.logger.info('没有找到持久化数据，将创建新的缓存');
                return {
                    fileCache: []
                };
            }
            
            this.logger.warn('持久化存储中的数据格式无效');
            return {
                fileCache: []
            };
        } catch (error) {
            this.logger.error('加载缓存数据失败:', error);
            return {
                fileCache: []
            };
        }
    }

    /**
     * 封装插件的saveData方法
     */
    private async savePluginData(data: CacheData): Promise<void> {
        await this.plugin.saveData(data);
    }

    /**
     * 封装插件的loadData方法
     */
    private async loadPluginData(): Promise<any> {
        return await this.plugin.loadData();
    }
} 