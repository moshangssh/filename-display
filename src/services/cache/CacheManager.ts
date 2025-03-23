import { ILoggerService } from '../interfaces/IServices';
import { TFile } from 'obsidian';

/**
 * 缓存条目接口，定义缓存的数据结构
 */
export interface CacheEntry<T> {
  data: T;               // 缓存的实际数据
  mtime: number;         // 文件修改时间
  timestamp: number;     // 缓存创建/更新时间
  accessCount: number;   // 访问次数
  lastAccessed: number;  // 最后访问时间
}

/**
 * 中心化缓存管理服务
 * 为所有模块提供统一的缓存接口
 */
export class CacheManager {
  private static instance: CacheManager;
  
  // 文件显示名称缓存
  private readonly displayNameCache = new Map<string, CacheEntry<{
    displayName: string,
    originalName: string,
    processed: boolean
  }>>();
  
  // 链接缓存
  private readonly linkCache = new Map<string, CacheEntry<{
    displayName: string,
    targetPath: string
  }>>();
  
  // 编辑器装饰缓存
  private readonly decorationCache = new Map<string, CacheEntry<{
    from: number,
    to: number, 
    displayText: string
  }>>();

  private constructor(private readonly logger: ILoggerService) {
    this.logger.debug('CacheManager 实例已创建');
  }
  
  /**
   * 获取单例实例
   */
  public static getInstance(logger: ILoggerService): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(logger);
    }
    return CacheManager.instance;
  }

  /**
   * 设置显示名称缓存
   */
  public setDisplayName(path: string, displayName: string, originalName: string, mtime: number): void {
    this.displayNameCache.set(path, {
      data: {
        displayName,
        originalName,
        processed: true
      },
      mtime,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now()
    });
  }

  /**
   * 获取显示名称
   */
  public getDisplayName(path: string): string | undefined {
    const entry = this.displayNameCache.get(path);
    if (entry) {
      // 更新访问信息
      entry.accessCount += 1;
      entry.lastAccessed = Date.now();
      return entry.data.displayName;
    }
    return undefined;
  }

  /**
   * 获取原始名称
   */
  public getOriginalName(path: string): string | undefined {
    const entry = this.displayNameCache.get(path);
    if (entry) {
      // 更新访问信息
      entry.accessCount += 1;
      entry.lastAccessed = Date.now();
      return entry.data.originalName;
    }
    return undefined;
  }

  /**
   * 检查缓存是否有效
   */
  public isCacheValid(path: string, file: TFile): boolean {
    const entry = this.displayNameCache.get(path);
    if (!entry) return false;
    
    // 比较文件修改时间
    return entry.mtime === file.stat.mtime;
  }

  /**
   * 缓存链接显示名称
   */
  public setCachedLink(sourcePath: string, targetPath: string, displayName: string): void {
    const cacheKey = `${sourcePath}:${targetPath}`;
    
    this.linkCache.set(cacheKey, {
      data: {
        displayName,
        targetPath
      },
      mtime: 0,  // 链接缓存使用目标文件的mtime更新
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now()
    });
  }

  /**
   * 获取缓存的链接显示名称
   */
  public getCachedLink(sourcePath: string, targetPath: string): string | undefined {
    const cacheKey = `${sourcePath}:${targetPath}`;
    const entry = this.linkCache.get(cacheKey);
    
    if (entry) {
      // 更新访问信息
      entry.accessCount += 1;
      entry.lastAccessed = Date.now();
      return entry.data.displayName;
    }
    
    return undefined;
  }

  /**
   * 更新链接缓存的文件修改时间
   */
  public updateLinkMTime(targetPath: string, mtime: number): void {
    // 更新所有引用该目标路径的链接缓存
    for (const [key, entry] of this.linkCache.entries()) {
      if (entry.data.targetPath === targetPath) {
        entry.mtime = mtime;
      }
    }
  }

  /**
   * 缓存编辑器装饰
   */
  public setDecorationCache(editorId: string, linkId: string, from: number, to: number, displayText: string): void {
    const cacheKey = `${editorId}:${linkId}`;
    
    this.decorationCache.set(cacheKey, {
      data: {
        from,
        to,
        displayText
      },
      mtime: 0,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now()
    });
  }

  /**
   * 获取编辑器装饰缓存
   */
  public getDecorationCache(editorId: string, linkId: string): { from: number, to: number, displayText: string } | undefined {
    const cacheKey = `${editorId}:${linkId}`;
    const entry = this.decorationCache.get(cacheKey);
    
    if (entry) {
      // 更新访问信息
      entry.accessCount += 1;
      entry.lastAccessed = Date.now();
      return entry.data;
    }
    
    return undefined;
  }

  /**
   * 清除文件相关的所有缓存
   */
  public clearFileCache(path: string): void {
    // 清除显示名称缓存
    this.displayNameCache.delete(path);
    
    // 清除相关的链接缓存
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.linkCache.entries()) {
      if (key.startsWith(`${path}:`) || entry.data.targetPath === path) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.linkCache.delete(key));
    
    // 清除相关的装饰缓存
    const decorationKeysToDelete: string[] = [];
    for (const key of this.decorationCache.keys()) {
      if (key.includes(path)) {
        decorationKeysToDelete.push(key);
      }
    }
    
    decorationKeysToDelete.forEach(key => this.decorationCache.delete(key));
  }

  /**
   * 清理过期缓存
   * 根据LRU (最近最少使用) 策略清理超过容量的缓存
   */
  public cleanupCache(maxDisplayNameEntries = 1000, maxLinkEntries = 5000, maxDecorationEntries = 2000): void {
    this.logger.debug(`开始清理缓存，当前大小：显示名称=${this.displayNameCache.size}，链接=${this.linkCache.size}，装饰=${this.decorationCache.size}`);
    
    // 清理显示名称缓存
    if (this.displayNameCache.size > maxDisplayNameEntries) {
      this.cleanupMapByLRU(this.displayNameCache, maxDisplayNameEntries);
    }
    
    // 清理链接缓存
    if (this.linkCache.size > maxLinkEntries) {
      this.cleanupMapByLRU(this.linkCache, maxLinkEntries);
    }
    
    // 清理装饰缓存
    if (this.decorationCache.size > maxDecorationEntries) {
      this.cleanupMapByLRU(this.decorationCache, maxDecorationEntries);
    }
    
    this.logger.debug(`缓存清理完成，当前大小：显示名称=${this.displayNameCache.size}，链接=${this.linkCache.size}，装饰=${this.decorationCache.size}`);
  }

  /**
   * 根据LRU策略清理Map
   */
  private cleanupMapByLRU<T>(map: Map<string, CacheEntry<T>>, maxEntries: number): void {
    if (map.size <= maxEntries) return;
    
    // 将条目转换为数组并按最后访问时间排序
    const entries = Array.from(map.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    // 计算需要删除的条目数量
    const deleteCount = map.size - maxEntries;
    
    // 删除最旧的条目
    for (let i = 0; i < deleteCount; i++) {
      map.delete(entries[i][0]);
    }
  }

  /**
   * 清除所有缓存
   */
  public clearAll(): void {
    this.displayNameCache.clear();
    this.linkCache.clear();
    this.decorationCache.clear();
    this.logger.info('所有缓存已清除');
  }

  /**
   * 获取缓存统计信息
   */
  public getStats(): { displayNameSize: number, linkSize: number, decorationSize: number } {
    return {
      displayNameSize: this.displayNameCache.size,
      linkSize: this.linkCache.size,
      decorationSize: this.decorationCache.size
    };
  }
} 