import { ILoggerService } from './interfaces/IServices';

/**
 * 错误类型枚举
 */
export enum ErrorType {
  DOM = 'DOM',
  CACHE = 'CACHE',
  FILE = 'FILE',
  PARSER = 'PARSER',
  RENDER = 'RENDER',
  NETWORK = 'NETWORK',
  UNKNOWN = 'UNKNOWN'
}

/**
 * 错误严重性枚举
 */
export enum ErrorSeverity {
  LOW = 'LOW',         // 不影响功能的轻微错误
  MEDIUM = 'MEDIUM',   // 影响部分功能但不阻塞主要功能
  HIGH = 'HIGH',       // 严重错误，可能导致功能不可用
  CRITICAL = 'CRITICAL' // 致命错误，可能导致崩溃
}

/**
 * 错误记录接口
 */
export interface ErrorRecord {
  type: ErrorType;
  severity: ErrorSeverity;
  component: string;
  message: string;
  timestamp: number;
  count: number;
  error?: Error;
}

/**
 * 错误处理和恢复系统
 * 确保单个组件的失败不会导致整个功能崩溃
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  
  // 错误计数映射，用于跟踪各组件错误次数
  private errorCounts: Map<string, number> = new Map();
  
  // 错误历史记录
  private errorHistory: ErrorRecord[] = [];
  
  // 最大错误历史记录数
  private readonly MAX_ERROR_HISTORY = 100;
  
  // 组件最大错误次数
  private readonly MAX_COMPONENT_ERRORS = 5;
  
  // 错误计数重置间隔（毫秒）
  private readonly ERROR_RESET_INTERVAL = 60000; // 1分钟
  
  // 最大错误历史保留时间（毫秒）
  private readonly ERROR_HISTORY_TTL = 3600000; // 1小时
  
  private constructor(private readonly logger: ILoggerService) {
    // 定期清理过期的错误历史
    setInterval(() => this.cleanupErrorHistory(), this.ERROR_RESET_INTERVAL);
  }
  
  /**
   * 获取单例实例
   */
  public static getInstance(logger: ILoggerService): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler(logger);
    }
    return ErrorHandler.instance;
  }
  
  /**
   * 处理错误
   * @param component 组件名称
   * @param error 错误对象
   * @param type 错误类型
   * @param severity 错误严重性
   * @param recoveryFn 恢复函数
   * @returns 是否应该尝试恢复
   */
  public handleError(
    component: string, 
    error: Error | string, 
    type: ErrorType = ErrorType.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    recoveryFn?: () => void
  ): boolean {
    // 构造错误消息
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    
    // 记录错误
    this.logger.error(`[${component}][${type}] 错误: ${errorMessage}`, errorObj);
    
    // 增加错误计数
    const currentCount = (this.errorCounts.get(component) || 0) + 1;
    this.errorCounts.set(component, currentCount);
    
    // 记录到错误历史
    this.addErrorRecord(component, type, severity, errorMessage, errorObj);
    
    // 判断是否可以尝试恢复
    const shouldRecover = currentCount <= this.MAX_COMPONENT_ERRORS && 
                         severity !== ErrorSeverity.CRITICAL;
    
    // 如果可以恢复且提供了恢复函数，尝试恢复
    if (shouldRecover && recoveryFn) {
      try {
        // 使用setTimeout确保错误处理完成后再尝试恢复
        setTimeout(() => {
          try {
            recoveryFn();
            this.logger.info(`[${component}] 成功恢复`);
          } catch (recoveryError) {
            this.logger.error(`[${component}] 恢复失败: ${recoveryError}`);
            // 递增错误计数，但不再尝试恢复
            this.errorCounts.set(component, (this.errorCounts.get(component) || 0) + 1);
          }
        }, 100);
      } catch (e) {
        this.logger.error(`[${component}] 安排恢复时出错: ${e}`);
      }
    }
    
    // 如果这是第一次错误，设置定时器重置错误计数
    if (currentCount === 1) {
      setTimeout(() => {
        this.errorCounts.set(component, 0);
      }, this.ERROR_RESET_INTERVAL);
    }
    
    return shouldRecover;
  }
  
  /**
   * 添加错误记录到历史
   */
  private addErrorRecord(
    component: string,
    type: ErrorType,
    severity: ErrorSeverity,
    message: string,
    error?: Error
  ): void {
    // 查找是否存在相同组件和相似消息的记录
    const existingRecordIndex = this.errorHistory.findIndex(
      record => record.component === component && record.message === message
    );
    
    const timestamp = Date.now();
    
    if (existingRecordIndex >= 0) {
      // 更新已有记录
      const record = this.errorHistory[existingRecordIndex];
      record.count += 1;
      record.timestamp = timestamp; // 更新时间戳
      
      // 如果新错误的严重性更高，更新严重性
      if (this.getSeverityValue(severity) > this.getSeverityValue(record.severity)) {
        record.severity = severity;
      }
    } else {
      // 创建新记录
      const newRecord: ErrorRecord = {
        type,
        severity,
        component,
        message,
        timestamp,
        count: 1,
        error
      };
      
      // 确保不超过最大历史记录数
      if (this.errorHistory.length >= this.MAX_ERROR_HISTORY) {
        this.errorHistory.shift(); // 移除最旧的记录
      }
      
      this.errorHistory.push(newRecord);
    }
  }
  
  /**
   * 获取严重性枚举值的数值表示
   */
  private getSeverityValue(severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.LOW: return 1;
      case ErrorSeverity.MEDIUM: return 2;
      case ErrorSeverity.HIGH: return 3;
      case ErrorSeverity.CRITICAL: return 4;
      default: return 0;
    }
  }
  
  /**
   * 清理过期的错误历史
   */
  private cleanupErrorHistory(): void {
    const now = Date.now();
    const cutoffTime = now - this.ERROR_HISTORY_TTL;
    
    // 移除超过保留时间的记录
    this.errorHistory = this.errorHistory.filter(record => record.timestamp >= cutoffTime);
  }
  
  /**
   * 获取特定组件的错误计数
   */
  public getErrorCount(component: string): number {
    return this.errorCounts.get(component) || 0;
  }
  
  /**
   * 检查组件是否处于错误状态
   */
  public isComponentInErrorState(component: string): boolean {
    return (this.errorCounts.get(component) || 0) > 0;
  }
  
  /**
   * 重置特定组件的错误计数
   */
  public resetComponentErrorCount(component: string): void {
    this.errorCounts.set(component, 0);
  }
  
  /**
   * 获取错误历史记录
   */
  public getErrorHistory(): ErrorRecord[] {
    return [...this.errorHistory].sort((a, b) => b.timestamp - a.timestamp);
  }
  
  /**
   * 获取按组件分组的错误摘要
   */
  public getErrorSummaryByComponent(): Record<string, { count: number, lastError: string, severity: ErrorSeverity }> {
    const summary: Record<string, { count: number, lastError: string, severity: ErrorSeverity }> = {};
    
    for (const record of this.errorHistory) {
      if (!summary[record.component]) {
        summary[record.component] = {
          count: 0,
          lastError: '',
          severity: ErrorSeverity.LOW
        };
      }
      
      summary[record.component].count += record.count;
      
      // 更新最新错误信息
      if (record.timestamp > (summary[record.component].lastError ? 0 : record.timestamp)) {
        summary[record.component].lastError = record.message;
      }
      
      // 更新最高严重性
      if (this.getSeverityValue(record.severity) > this.getSeverityValue(summary[record.component].severity)) {
        summary[record.component].severity = record.severity;
      }
    }
    
    return summary;
  }
  
  /**
   * 获取错误统计信息
   */
  public getErrorStats(): { total: number, byType: Record<ErrorType, number>, byComponent: Record<string, number> } {
    let total = 0;
    const byType: Record<ErrorType, number> = {
      [ErrorType.DOM]: 0,
      [ErrorType.CACHE]: 0,
      [ErrorType.FILE]: 0,
      [ErrorType.PARSER]: 0,
      [ErrorType.RENDER]: 0,
      [ErrorType.NETWORK]: 0,
      [ErrorType.UNKNOWN]: 0
    };
    const byComponent: Record<string, number> = {};
    
    for (const record of this.errorHistory) {
      total += record.count;
      byType[record.type] = (byType[record.type] || 0) + record.count;
      byComponent[record.component] = (byComponent[record.component] || 0) + record.count;
    }
    
    return { total, byType, byComponent };
  }
  
  /**
   * 清除所有错误记录
   */
  public clearAll(): void {
    this.errorCounts.clear();
    this.errorHistory = [];
  }
  
  /**
   * 尝试包装一个函数，添加错误处理
   */
  public wrapWithErrorHandler<T extends any[], R>(
    component: string,
    fn: (...args: T) => R,
    type: ErrorType = ErrorType.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    recoveryFn?: () => void
  ): (...args: T) => R | undefined {
    return (...args: T): R | undefined => {
      try {
        return fn(...args);
      } catch (error) {
        this.handleError(component, error as Error, type, severity, recoveryFn);
        return undefined;
      }
    };
  }
  
  /**
   * 尝试包装一个异步函数，添加错误处理
   */
  public wrapAsyncWithErrorHandler<T extends any[], R>(
    component: string,
    fn: (...args: T) => Promise<R>,
    type: ErrorType = ErrorType.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    recoveryFn?: () => void
  ): (...args: T) => Promise<R | undefined> {
    return async (...args: T): Promise<R | undefined> => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handleError(component, error as Error, type, severity, recoveryFn);
        return undefined;
      }
    };
  }
} 