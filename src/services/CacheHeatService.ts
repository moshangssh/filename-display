import type { ITitleExtractorPlugin } from '../types';
import { BaseCacheService } from './base/BaseCacheService';

interface HeatRecord {
  count: number;          // 访问次数
  lastAccessed: number;   // 最后访问时间
  weight: number;         // 计算得到的权重
}

export class CacheHeatService extends BaseCacheService<Map<string, HeatRecord>> {
  private heatMap: Map<string, HeatRecord> = new Map();
  private readonly DECAY_FACTOR = 0.5;  // 时间衰减因子
  private readonly MAX_HEAT = 100;      // 最大热度值
  private readonly MIN_HEAT = 0;        // 最小热度值

  constructor(plugin: ITitleExtractorPlugin) {
    super(plugin, 'title-extractor-cache-heat', 'CacheHeatService');
    
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

    this.logger.log('更新文件热度:', {
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
  public async cleanup(threshold: number = 10): Promise<void> {
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
      this.logger.log(`清理了 ${cleaned} 条低热度记录`);
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
    // 将Map转换为普通对象以便JSON序列化
    const data = Object.fromEntries(this.heatMap);
    await this.saveData(data);
  }

  /**
   * 从本地存储加载热度图
   */
  private async loadHeatMap(): Promise<void> {
    const data = await this.loadData<Record<string, HeatRecord>>();
    if (data) {
      this.heatMap = new Map(Object.entries(data));
      this.logger.log('加载热度数据成功');
    }
  }
} 