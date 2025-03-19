import type { ITitleExtractorPlugin } from '../types';
import { BaseCacheService } from './base/BaseCacheService';

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

export class PersistentCacheService extends BaseCacheService<CacheMetadata> {
  private readonly CACHE_VERSION = '1.0.0';
  private readonly CACHE_DIR: string;
  private readonly METADATA_FILE: string;
  
  constructor(
    plugin: ITitleExtractorPlugin,
  ) {
    super(plugin, 'persistent-cache-metadata', 'PersistentCacheService');
    this.CACHE_DIR = `${this.plugin.app.vault.configDir}/persistent-cache`;
    this.METADATA_FILE = `${this.CACHE_DIR}/metadata.json`;
  }

  /**
   * 初始化缓存目录和元数据
   */
  public async initialize(): Promise<void> {
    try {
      // 确保缓存目录存在
      await this.ensureDirectory(this.CACHE_DIR);

      // 初始化或加载元数据
      const metadata = await this.getMetadata();
      if (!metadata) {
        await this.saveMetadata({
          version: this.CACHE_VERSION,
          lastUpdate: Date.now(),
          totalEntries: 0
        });
      }
    } catch (error) {
      this.logger.error('初始化缓存失败:', error);
      throw error;
    }
  }

  /**
   * 保存数据到持久化缓存
   */
  public async set<T>(key: string, data: T): Promise<void> {
    try {
      // 只持久化符合条件的数据（无需热度判断）
      const entry: CacheEntry<T> = {
        data,
        version: this.CACHE_VERSION,
        timestamp: Date.now(),
        hash: await this.calculateHash(data)
      };

      const filePath = this.getCacheFilePath(key);
      await this.plugin.app.vault.adapter.write(filePath, JSON.stringify(entry));
      
      // 更新元数据
      const metadata = await this.getMetadata() || {
        version: this.CACHE_VERSION,
        lastUpdate: Date.now(),
        totalEntries: 0
      };
      metadata.totalEntries++;
      metadata.lastUpdate = Date.now();
      await this.saveMetadata(metadata);
    } catch (error) {
      this.logger.error('保存缓存失败:', error);
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

        // 移除热度记录
        return entry.data;
      }

      return null;
    } catch (error) {
      this.logger.error('读取缓存失败:', error);
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
        if (metadata) {
          metadata.totalEntries = Math.max(0, metadata.totalEntries - 1);
          metadata.lastUpdate = Date.now();
          await this.saveMetadata(metadata);
        }
      }
    } catch (error) {
      this.logger.error('删除缓存失败:', error);
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
      this.logger.error('增量更新失败:', error);
      throw error;
    }
  }

  /**
   * 清理缓存数据
   * @param threshold 清理阈值（天数），将删除超过这个阈值的缓存
   */
  public async cleanup(threshold: number = 7): Promise<void> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      const now = Date.now();
      const maxAgeMs = threshold * 24 * 60 * 60 * 1000; // 转换为毫秒
      let cleaned = 0;
      
      // 确保缓存目录存在
      if (await adapter.exists(this.CACHE_DIR)) {
        const cacheFiles = await adapter.list(this.CACHE_DIR);
        
        // 跳过元数据文件
        const files = cacheFiles.files.filter(file => file !== this.METADATA_FILE);
        
        for (const file of files) {
          try {
            const stats = await adapter.stat(file);
            if (stats && (now - stats.mtime > maxAgeMs)) {
              await adapter.remove(file);
              cleaned++;
            }
          } catch (error) {
            this.logger.error('清理文件失败:', file, error);
          }
        }
        
        // 更新元数据
        const metadata = await this.getMetadata();
        if (metadata) {
          metadata.totalEntries -= cleaned;
          metadata.lastUpdate = now;
          await this.saveMetadata(metadata);
        }
        
        this.logger.log(`缓存清理完成，删除了 ${cleaned} 个过期文件`);
      }
    } catch (error) {
      this.logger.error('清理缓存失败:', error);
    }
  }

  /**
   * 获取缓存元数据
   */
  private async getMetadata(): Promise<CacheMetadata | null> {
    try {
      if (await this.plugin.app.vault.adapter.exists(this.METADATA_FILE)) {
        const content = await this.plugin.app.vault.adapter.read(this.METADATA_FILE);
        return JSON.parse(content);
      }
      return null;
    } catch (error) {
      this.logger.error('读取元数据失败:', error);
      return null;
    }
  }

  /**
   * 保存缓存元数据
   */
  private async saveMetadata(metadata: CacheMetadata): Promise<void> {
    try {
      await this.ensureDirectory(this.CACHE_DIR);
      await this.plugin.app.vault.adapter.write(this.METADATA_FILE, JSON.stringify(metadata));
    } catch (error) {
      this.logger.error('保存元数据失败:', error);
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