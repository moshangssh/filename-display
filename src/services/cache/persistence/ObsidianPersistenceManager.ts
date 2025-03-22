import { IPersistenceManager, CacheData, FileCacheItem } from '../interfaces';
import { ILoggerService } from '../../interfaces/IServices';
import { ITitleExtractorPlugin } from '../../../types';

/**
 * Obsidian持久化管理器
 * 负责将缓存数据保存到Obsidian的数据存储中
 */
export class ObsidianPersistenceManager implements IPersistenceManager<CacheData> {
    private readonly CACHE_KEY = 'filename-display-cache';
    private readonly DATA_VERSION = 1; // 数据版本号，用于后续兼容性处理
    
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
            // 添加版本信息
            const dataWithVersion = {
                version: this.DATA_VERSION,
                ...data
            };
            
            // 使用正确的API方式保存数据
            await this.savePluginData(dataWithVersion);
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
            const rawData = await this.loadPluginData();
            
            // 如果没有数据，创建新的缓存
            if (!rawData) {
                this.logger.info('没有找到持久化数据，将创建新的缓存');
                return { fileCache: [] };
            }
            
            // 检查数据版本并进行迁移
            const data = this.migrateDataIfNeeded(rawData);
            
            // 验证数据结构
            if (this.isValidCacheData(data)) {
                this.logger.debug(`从持久化存储加载了 ${data.fileCache.length} 个缓存项`);
                return data;
            }
            
            this.logger.warn('持久化存储中的数据格式无效，将重置缓存');
            return { fileCache: [] };
        } catch (error) {
            this.logger.error('加载缓存数据失败:', error);
            return { fileCache: [] };
        }
    }

    /**
     * 验证缓存数据格式是否有效
     */
    private isValidCacheData(data: any): data is CacheData {
        // 基本结构检查
        if (!data || typeof data !== 'object') return false;
        if (!Array.isArray(data.fileCache)) return false;
        
        // 检查数组内部每个元素
        for (const entry of data.fileCache) {
            // 检查是否为二元组 [string, object]
            if (!Array.isArray(entry) || entry.length !== 2) return false;
            if (typeof entry[0] !== 'string') return false;
            
            const itemData = entry[1];
            // 检查必要字段
            if (typeof itemData !== 'object' || itemData === null) return false;
            if (typeof itemData.displayName !== 'string') return false;
            if (typeof itemData.originalName !== 'string') return false;
            if (typeof itemData.timestamp !== 'number') return false;
            if (typeof itemData.mtime !== 'number') return false;
            if (typeof itemData.processed !== 'boolean') return false;
            if (typeof itemData.priority !== 'boolean') return false;
            if (typeof itemData.accessCount !== 'number') return false;
            if (!Array.isArray(itemData.links)) return false;
        }
        
        return true;
    }
    
    /**
     * 根据数据版本进行迁移
     */
    private migrateDataIfNeeded(data: any): CacheData {
        // 如果数据没有版本信息或者结构不符合当前期望，尝试转换
        if (!data.version) {
            try {
                return this.migrateFromLegacyFormat(data);
            } catch (e) {
                this.logger.warn('旧数据格式迁移失败:', e);
                return { fileCache: [] };
            }
        }
        
        // 当未来有更多版本时，可以在这里添加更多的迁移逻辑
        return data;
    }
    
    /**
     * 从旧格式迁移数据
     */
    private migrateFromLegacyFormat(oldData: any): CacheData {
        // 尝试处理几种可能的旧格式
        
        // 情况1: 如果已经是符合格式的数据，直接返回
        if (oldData.fileCache && Array.isArray(oldData.fileCache)) {
            return { fileCache: oldData.fileCache };
        }
        
        // 情况2: 如果是一个普通对象，转换为新格式
        if (typeof oldData === 'object' && !Array.isArray(oldData)) {
            const entries: [string, any][] = [];
            
            // 尝试从各种可能的格式中提取数据
            for (const key in oldData) {
                if (typeof oldData[key] === 'object' && oldData[key]) {
                    const item = oldData[key];
                    
                    // 构建兼容数据
                    const compatItem = {
                        displayName: item.displayName || key,
                        originalName: item.originalName || key,
                        timestamp: item.timestamp || Date.now(),
                        mtime: item.mtime || 0,
                        processed: item.processed || false,
                        priority: item.priority || false,
                        accessCount: item.accessCount || 1,
                        links: (item.links && Array.isArray(item.links)) ? item.links : [],
                        result: item.result
                    };
                    
                    entries.push([key, compatItem]);
                }
            }
            
            return { fileCache: entries };
        }
        
        // 无法从现有数据中提取有效信息，返回空数据
        return { fileCache: [] };
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