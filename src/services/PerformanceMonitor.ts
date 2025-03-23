import { ILoggerService } from './interfaces/IServices';

/**
 * 性能指标接口
 */
export interface PerformanceMetric {
  total: number;      // 累计时间
  count: number;      // 调用次数
  max: number;        // 最大时间
  min: number;        // 最小时间
  lastValue: number;  // 最近一次测量值
}

/**
 * 性能报告接口
 */
export interface PerformanceReport {
  [key: string]: {
    avg: number;     // 平均时间
    max: number;     // 最大时间
    min: number;     // 最小时间
    count: number;   // 调用次数
    lastValue: number; // 最近一次测量值
  };
}

/**
 * 性能监控系统
 * 用于跟踪各个模块的处理时间，帮助识别性能瓶颈
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  
  // 性能指标存储
  private metrics: Map<string, PerformanceMetric> = new Map();
  
  // 是否启用监控
  private enabled: boolean = false;
  
  // 自动报告阈值（毫秒）- 超过此时间的操作会被自动记录
  private autoReportThreshold: number = 50;
  
  private constructor(private readonly logger: ILoggerService) {}
  
  /**
   * 获取单例实例
   */
  public static getInstance(logger: ILoggerService): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor(logger);
    }
    return PerformanceMonitor.instance;
  }
  
  /**
   * 启用性能监控
   */
  public enable(autoReportThreshold: number = 50): void {
    this.enabled = true;
    this.autoReportThreshold = autoReportThreshold;
    this.logger.debug(`性能监控已启用，自动报告阈值: ${autoReportThreshold}ms`);
  }
  
  /**
   * 禁用性能监控
   */
  public disable(): void {
    this.enabled = false;
    this.logger.debug('性能监控已禁用');
  }
  
  /**
   * 开始测量
   * @param id 性能测量标识
   * @returns 结束测量的回调函数
   */
  public startMeasure(id: string): () => void {
    if (!this.enabled) {
      return () => {}; // 如果禁用监控，返回空函数
    }
    
    const start = performance.now();
    return () => this.endMeasure(id, start);
  }
  
  /**
   * 使用装饰器模式包装函数，自动测量性能
   * @param id 性能测量标识
   * @param fn 要测量的函数
   * @returns 包装后的函数
   */
  public measure<T extends any[], R>(id: string, fn: (...args: T) => R): (...args: T) => R {
    return (...args: T): R => {
      if (!this.enabled) {
        return fn(...args);
      }
      
      const start = performance.now();
      try {
        return fn(...args);
      } finally {
        this.endMeasure(id, start);
      }
    };
  }
  
  /**
   * 异步函数的性能测量包装
   * @param id 性能测量标识
   * @param fn 要测量的异步函数
   * @returns 包装后的异步函数
   */
  public measureAsync<T extends any[], R>(id: string, fn: (...args: T) => Promise<R>): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      if (!this.enabled) {
        return fn(...args);
      }
      
      const start = performance.now();
      try {
        return await fn(...args);
      } finally {
        this.endMeasure(id, start);
      }
    };
  }
  
  /**
   * 结束测量并记录结果
   * @param id 性能测量标识
   * @param startTime 开始时间
   */
  private endMeasure(id: string, startTime: number): void {
    const duration = performance.now() - startTime;
    
    // 获取或创建指标记录
    let metric = this.metrics.get(id);
    if (!metric) {
      metric = {
        total: 0,
        count: 0,
        max: -Infinity,
        min: Infinity,
        lastValue: 0
      };
      this.metrics.set(id, metric);
    }
    
    // 更新指标数据
    metric.total += duration;
    metric.count += 1;
    metric.max = Math.max(metric.max, duration);
    metric.min = Math.min(metric.min, duration);
    metric.lastValue = duration;
    
    // 自动报告超过阈值的操作
    if (duration > this.autoReportThreshold) {
      this.logger.warn(`性能警告: ${id} 耗时 ${duration.toFixed(2)}ms，超过阈值 ${this.autoReportThreshold}ms`);
    }
  }
  
  /**
   * 获取性能报告
   */
  public getReport(): PerformanceReport {
    const report: PerformanceReport = {};
    
    for (const [id, metric] of this.metrics.entries()) {
      if (metric.count === 0) continue;
      
      report[id] = {
        avg: metric.total / metric.count,
        max: metric.max,
        min: metric.min === Infinity ? 0 : metric.min,
        count: metric.count,
        lastValue: metric.lastValue
      };
    }
    
    return report;
  }
  
  /**
   * 获取特定操作的性能数据
   */
  public getMetric(id: string): { avg: number, max: number, min: number, count: number, lastValue: number } | undefined {
    const metric = this.metrics.get(id);
    if (!metric || metric.count === 0) return undefined;
    
    return {
      avg: metric.total / metric.count,
      max: metric.max,
      min: metric.min === Infinity ? 0 : metric.min,
      count: metric.count,
      lastValue: metric.lastValue
    };
  }
  
  /**
   * 记录性能日志
   */
  public logReport(): void {
    if (!this.enabled || this.metrics.size === 0) {
      this.logger.info('性能监控未启用或无性能数据');
      return;
    }
    
    const report = this.getReport();
    const items = Object.entries(report)
      .sort((a, b) => b[1].avg - a[1].avg) // 按平均时间降序排序
      .map(([id, data]) => {
        return `${id}: 平均=${data.avg.toFixed(2)}ms, 最大=${data.max.toFixed(2)}ms, 调用=${data.count}次`;
      });
    
    this.logger.info('性能报告:\n' + items.join('\n'));
  }
  
  /**
   * 重置性能数据
   */
  public reset(): void {
    this.metrics.clear();
    this.logger.debug('性能监控数据已重置');
  }
  
  /**
   * 释放资源
   */
  public dispose(): void {
    this.metrics.clear();
    this.enabled = false;
  }
} 