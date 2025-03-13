import { Logger } from '../utils/logger';
import type { ITitleExtractorPlugin } from '../types';
import { CacheHeatService } from './CacheHeatService';

const logger = new Logger('PersistentCacheService');

interface CacheMetadata {
  version: string;
  lastUpdate: number;
  totalEntries: number;
}

interface CacheEntry<T> {
  data: T;
  version: string;
  timestamp: number;
  hash: string;
}

export class PersistentCacheService {
  private readonly CACHE_VERSION = '1.0.0';
  private readonly CACHE_DIR: string;
  private readonly METADATA_FILE: string;
  
  constructor(
    private readonly plugin: ITitleExtractorPlugin,
    private readonly heatService: CacheHeatService
  ) {
    this.CACHE_DIR = `${this.plugin.app.vault.configDir}/persistent-cache`;
    this.METADATA_FILE = `${this.CACHE_DIR}/metadata.json`;
  }

  /**
   * 初始化缓存目录和元数据
   */
  public async initialize(): Promise<void> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      
      // 确保缓存目录存在
      if (!(await adapter.exists(this.CACHE_DIR))) {
        await adapter.mkdir(this.CACHE_DIR);
      }

      // 初始化或加载元数据
      if (!(await adapter.exists(this.METADATA_FILE))) {
        await this.saveMetadata({
          version: this.CACHE_VERSION,
          lastUpdate: Date.now(),
          totalEntries: 0
        });
      }
    } catch (error) {
      logger.error('初始化缓存失败:', error);
      throw error;
    }
  }

  /**
   * 保存数据到持久化缓存
   */
  public async set<T>(key: string, data: T): Promise<void> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      const heat = await this.heatService.getHeat(key);
      
      // 只持久化高频缓存（热度大于阈值的数据）
      if (heat > this.plugin.settings.persistentCacheHeatThreshold) {
        const entry: CacheEntry<T> = {
          data,
          version: this.CACHE_VERSION,
          timestamp: Date.now(),
          hash: await this.calculateHash(data)
        };

        const filePath = this.getCacheFilePath(key);
        await adapter.write(filePath, JSON.stringify(entry));
        
        // 更新元数据
        const metadata = await this.getMetadata();
        metadata.totalEntries++;
        metadata.lastUpdate = Date.now();
        await this.saveMetadata(metadata);
      }
    } catch (error) {
      logger.error('保存缓存失败:', error);
      throw error;
    }
  }

  /**
   * 从持久化缓存获取数据
   */
  public async get<T>(key: string): Promise<T | null> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      const filePath = this.getCacheFilePath(key);

      if (await adapter.exists(filePath)) {
        const content = await adapter.read(filePath);
        const entry: CacheEntry<T> = JSON.parse(content);

        // 版本检查
        if (entry.version !== this.CACHE_VERSION) {
          await this.delete(key);
          return null;
        }

        // 更新访问热度
        await this.heatService.recordAccess(key);
        return entry.data;
      }

      return null;
    } catch (error) {
      logger.error('读取缓存失败:', error);
      return null;
    }
  }

  /**
   * 删除缓存条目
   */
  public async delete(key: string): Promise<void> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      const filePath = this.getCacheFilePath(key);

      if (await adapter.exists(filePath)) {
        await adapter.remove(filePath);
        
        // 更新元数据
        const metadata = await this.getMetadata();
        metadata.totalEntries--;
        metadata.lastUpdate = Date.now();
        await this.saveMetadata(metadata);
      }
    } catch (error) {
      logger.error('删除缓存失败:', error);
      throw error;
    }
  }

  /**
   * 增量更新缓存
   */
  public async incrementalUpdate<T>(key: string, data: T): Promise<void> {
    try {
      const currentEntry = await this.get<T>(key);
      if (!currentEntry) {
        await this.set(key, data);
        return;
      }

      const newHash = await this.calculateHash(data);
      const oldHash = (await this.get<CacheEntry<T>>(key))?.hash;

      // 只有当数据发生变化时才更新
      if (newHash !== oldHash) {
        await this.set(key, data);
      }
    } catch (error) {
      logger.error('增量更新失败:', error);
      throw error;
    }
  }

  /**
   * 获取缓存元数据
   */
  private async getMetadata(): Promise<CacheMetadata> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      const content = await adapter.read(this.METADATA_FILE);
      return JSON.parse(content);
    } catch (error) {
      logger.error('读取元数据失败:', error);
      throw error;
    }
  }

  /**
   * 保存缓存元数据
   */
  private async saveMetadata(metadata: CacheMetadata): Promise<void> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      await adapter.write(this.METADATA_FILE, JSON.stringify(metadata));
    } catch (error) {
      logger.error('保存元数据失败:', error);
      throw error;
    }
  }

  /**
   * 计算数据的哈希值
   */
  private async calculateHash(data: any): Promise<string> {
    const str = JSON.stringify(data);
    const encoder = new TextEncoder();
    const buffer = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * 获取缓存文件路径
   */
  private getCacheFilePath(key: string): string {
    return `${this.CACHE_DIR}/${encodeURIComponent(key)}.json`;
  }
} 