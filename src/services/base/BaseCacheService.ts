import { LoggerService } from "../../services/LoggerService";
import type { ITitleExtractorPlugin } from '../../types';

/**
 * 基础缓存服务抽象类
 * 提供缓存服务共享的基本功能（保存/加载数据等）
 */
export abstract class BaseCacheService<T> {
    protected readonly logger: LoggerService;
    protected readonly plugin: ITitleExtractorPlugin;
    protected readonly storageKey: string;
    
    /**
     * 创建基础缓存服务实例
     * 
     * @param plugin 插件实例
     * @param storageKey 存储键名
     * @param loggerPrefix 日志前缀
     */
    constructor(plugin: ITitleExtractorPlugin, storageKey: string, loggerPrefix: string) {
        this.plugin = plugin;
        this.storageKey = storageKey;
        this.logger = new LoggerService(loggerPrefix);
    }
    
    /**
     * 通用保存数据方法
     * 
     * @param data 要保存的数据
     */
    protected async saveData(data: any): Promise<void> {
        try {
            const path = this.getStoragePath();
            await this.plugin.app.vault.adapter.write(
                path,
                JSON.stringify(data, null, 2)
            );
            this.logger.log('数据保存成功');
        } catch (error) {
            this.logger.error('保存数据失败:', error);
        }
    }
    
    /**
     * 通用加载数据方法
     * 
     * @returns 加载的数据，如果加载失败则返回null
     */
    protected async loadData<U>(): Promise<U | null> {
        try {
            const path = this.getStoragePath();
            const exists = await this.plugin.app.vault.adapter.exists(path);
            
            if (exists) {
                const data = JSON.parse(
                    await this.plugin.app.vault.adapter.read(path)
                );
                this.logger.log('数据加载成功');
                return data as U;
            }
        } catch (error) {
            this.logger.error('加载数据失败:', error);
        }
        
        return null;
    }
    
    /**
     * 确保存储目录存在
     * 
     * @param directory 目录路径
     */
    protected async ensureDirectory(directory: string): Promise<void> {
        try {
            const exists = await this.plugin.app.vault.adapter.exists(directory);
            if (!exists) {
                await this.plugin.app.vault.adapter.mkdir(directory);
                this.logger.log(`创建目录成功: ${directory}`);
            }
        } catch (error) {
            this.logger.error(`创建目录失败: ${directory}`, error);
            throw error;
        }
    }
    
    /**
     * 获取文件的完整存储路径
     */
    protected getStoragePath(): string {
        return `${this.plugin.app.vault.configDir}/${this.storageKey}.json`;
    }
    
    /**
     * 清理缓存数据
     * @param threshold 清理阈值（由子类定义具体含义）
     */
    public abstract cleanup(threshold?: number): Promise<void>;
} 