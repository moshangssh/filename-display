import { Logger } from '../utils/logger';
import type { ITitleExtractorPlugin } from '../types';
import { CacheHeatService } from './CacheHeatService';

const logger = new Logger('CacheCleanService');

export enum CleanupStrategy {
  HEAT_BASED = 'heat_based',      // 基于热度的清理
  TIME_BASED = 'time_based',      // 基于时间的清理
  HYBRID = 'hybrid'               // 混合策略
}

interface CleanupConfig {
  strategy: CleanupStrategy;
  heatThreshold?: number;         // 热度阈值
  maxAge?: number;                // 最大存活时间（小时）
  maxSize?: number;               // 最大缓存条目数
}

export class CacheCleanService {
  private readonly DEFAULT_CONFIG: CleanupConfig = {
    strategy: CleanupStrategy.HYBRID,
    heatThreshold: 10,
    maxAge: 24 * 7,              // 7天
    maxSize: 1000                // 最多1000条缓存
  };

  constructor(
    private readonly plugin: ITitleExtractorPlugin,
    private readonly heatService: CacheHeatService
  ) {}

  /**
   * 执行缓存清理
   * @param config 清理配置
   */
  public async cleanup(config: Partial<CleanupConfig> = {}): Promise<void> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    try {
      switch (finalConfig.strategy) {
        case CleanupStrategy.HEAT_BASED:
          await this.cleanupByHeat(finalConfig.heatThreshold!);
          break;
        case CleanupStrategy.TIME_BASED:
          await this.cleanupByTime(finalConfig.maxAge!);
          break;
        case CleanupStrategy.HYBRID:
          await this.cleanupHybrid(finalConfig);
          break;
      }
    } catch (error) {
      logger.error('缓存清理失败:', error);
    }
  }

  /**
   * 基于热度清理缓存
   */
  private async cleanupByHeat(threshold: number): Promise<void> {
    logger.log('执行基于热度的缓存清理, 阈值:', threshold);
    this.heatService.cleanupLowHeat(threshold);
  }

  /**
   * 基于时间清理缓存
   */
  private async cleanupByTime(maxAge: number): Promise<void> {
    const now = Date.now();
    const maxAgeMs = maxAge * 60 * 60 * 1000; // 转换为毫秒
    let cleaned = 0;

    // 获取所有缓存文件
    const cacheFiles = await this.plugin.app.vault.adapter.list(
      `${this.plugin.app.vault.configDir}/cache`
    );

    // 遍历并清理过期文件
    for (const file of cacheFiles.files) {
      try {
        const stats = await this.plugin.app.vault.adapter.stat(file);
        if (stats && now - stats.mtime > maxAgeMs) {
          await this.plugin.app.vault.adapter.remove(file);
          cleaned++;
        }
      } catch (error) {
        logger.error('清理文件失败:', file, error);
      }
    }

    logger.log(`基于时间的缓存清理完成, 清理了 ${cleaned} 个文件`);
  }

  /**
   * 混合策略清理缓存
   */
  private async cleanupHybrid(config: CleanupConfig): Promise<void> {
    logger.log('执行混合策略缓存清理');

    // 先基于热度清理
    await this.cleanupByHeat(config.heatThreshold!);

    // 如果缓存仍然超过大小限制，再基于时间清理
    const cacheFiles = await this.plugin.app.vault.adapter.list(
      `${this.plugin.app.vault.configDir}/cache`
    );

    if (cacheFiles.files.length > config.maxSize!) {
      // 计算需要额外清理的数量
      const extraCleanupNeeded = cacheFiles.files.length - config.maxSize!;
      // 动态调整时间阈值，直到清理足够的文件
      let currentMaxAge = config.maxAge!;
      
      while (currentMaxAge > 1 && extraCleanupNeeded > 0) {
        await this.cleanupByTime(currentMaxAge);
        currentMaxAge /= 2; // 每次减半最大年龄
      }
    }

    logger.log('混合策略缓存清理完成');
  }
} 