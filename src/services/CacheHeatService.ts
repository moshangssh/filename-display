import { Logger } from '../utils/logger';
import type { ITitleExtractorPlugin } from '../types';

const logger = new Logger('CacheHeatService');

interface HeatRecord {
  count: number;          // 访问次数
  lastAccessed: number;   // 最后访问时间
  weight: number;         // 计算得到的权重
}

export class CacheHeatService {
  private heatMap: Map<string, HeatRecord> = new Map();
  private readonly DECAY_FACTOR = 0.5;  // 时间衰减因子
  private readonly MAX_HEAT = 100;      // 最大热度值
  private readonly MIN_HEAT = 0;        // 最小热度值
  private readonly STORAGE_KEY = 'title-extractor-cache-heat';

  constructor(
    private readonly plugin: ITitleExtractorPlugin
  ) {
    // 从本地存储加载热度数据
    this.loadHeatMap();
  }

  /**
   * 记录文件访问
   * @param filePath 文件路径
   */
  public recordAccess(filePath: string): void {
    const now = Date.now();
    const record = this.heatMap.get(filePath) || {
      count: 0,
      lastAccessed: now,
      weight: 0
    };

    // 更新访问记录
    record.count++;
    record.lastAccessed = now;
    record.weight = this.calculateWeight(record);

    // 更新热度图
    this.heatMap.set(filePath, record);
    
    // 异步保存热度数据
    this.saveHeatMap();

    logger.log('更新文件热度:', {
      filePath,
      record
    });
  }

  /**
   * 获取文件热度
   * @param filePath 文件路径
   * @returns 热度值（0-100）
   */
  public getHeat(filePath: string): number {
    const record = this.heatMap.get(filePath);
    if (!record) return this.MIN_HEAT;

    // 重新计算权重
    record.weight = this.calculateWeight(record);
    return Math.min(this.MAX_HEAT, record.weight);
  }

  /**
   * 清理低热度记录
   * @param threshold 热度阈值，默认为 10
   */
  public cleanupLowHeat(threshold: number = 10): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [path, record] of this.heatMap.entries()) {
      // 重新计算权重
      record.weight = this.calculateWeight(record);
      
      // 如果权重低于阈值，删除记录
      if (record.weight < threshold) {
        this.heatMap.delete(path);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.log(`清理了 ${cleaned} 条低热度记录`);
      this.saveHeatMap();
    }
  }

  /**
   * 计算热度权重
   * @param record 热度记录
   * @returns 权重值
   */
  private calculateWeight(record: HeatRecord): number {
    const now = Date.now();
    const timeDiff = (now - record.lastAccessed) / (1000 * 60 * 60); // 转换为小时
    return record.count * Math.pow(this.DECAY_FACTOR, timeDiff);
  }

  /**
   * 保存热度图到本地存储
   */
  private async saveHeatMap(): Promise<void> {
    try {
      const data = Object.fromEntries(this.heatMap);
      await this.plugin.app.vault.adapter.write(
        `${this.plugin.app.vault.configDir}/${this.STORAGE_KEY}.json`,
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      logger.error('保存热度数据失败:', error);
    }
  }

  /**
   * 从本地存储加载热度图
   */
  private async loadHeatMap(): Promise<void> {
    try {
      const path = `${this.plugin.app.vault.configDir}/${this.STORAGE_KEY}.json`;
      const exists = await this.plugin.app.vault.adapter.exists(path);
      
      if (exists) {
        const data = JSON.parse(
          await this.plugin.app.vault.adapter.read(path)
        );
        this.heatMap = new Map(Object.entries(data));
        logger.log('加载热度数据成功');
      }
    } catch (error) {
      logger.error('加载热度数据失败:', error);
    }
  }
} 