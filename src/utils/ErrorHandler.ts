import { Notice } from 'obsidian';
import { LoggerService } from '../services/LoggerService';

// 创建错误处理专用日志记录器
const errorLogger = new LoggerService('ErrorHandler');

// 错误级别枚举
export enum ErrorLevel {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    CRITICAL = 'CRITICAL'
}

// 错误上下文接口
export interface ErrorContext {
    source: string;            // 错误来源（类名、函数名等）
    operation: string;         // 操作描述
    data?: Record<string, any>; // 相关数据（可选）
    timestamp?: number;        // 时间戳（可选，默认为当前时间）
}

// 记录到控制台的错误信息接口
interface ErrorLogEntry extends ErrorContext {
    message: string;           // 错误消息
    error?: Error;             // 原始错误对象（可选）
    level: ErrorLevel;         // 错误级别
    timestamp: number;         // 时间戳
}

/**
 * 错误处理类，提供统一的错误处理机制
 */
export class ErrorHandler {
    private static instance: ErrorHandler;
    private errorLogs: ErrorLogEntry[] = [];
    private maxLogEntries: number = 100;
    private showNotifications: boolean = true;

    private constructor() {
        // 私有构造函数，确保单例
    }

    /**
     * 获取错误处理器单例
     */
    public static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    /**
     * 设置是否显示通知
     */
    public setShowNotifications(show: boolean): void {
        this.showNotifications = show;
    }

    /**
     * 设置最大日志条目数
     */
    public setMaxLogEntries(max: number): void {
        this.maxLogEntries = max;
        this.pruneOldLogs();
    }

    /**
     * 捕获并处理错误
     */
    public captureError(
        error: unknown,
        context: ErrorContext,
        level: ErrorLevel = ErrorLevel.ERROR
    ): void {
        // 标准化错误对象
        const normalizedError = this.normalizeError(error);
        
        // 创建日志条目
        const logEntry: ErrorLogEntry = {
            ...context,
            message: normalizedError.message,
            error: normalizedError,
            level,
            timestamp: context.timestamp || Date.now()
        };

        // 记录到内存日志
        this.errorLogs.push(logEntry);
        this.pruneOldLogs();

        // 输出到控制台
        this.logToConsole(logEntry);

        // 显示通知（仅对错误和严重错误）
        if (this.showNotifications && (level === ErrorLevel.ERROR || level === ErrorLevel.CRITICAL)) {
            new Notice(`操作失败: ${context.operation}\n${normalizedError.message}`);
        }
    }

    /**
     * 包装函数，为其添加错误处理
     */
    public wrapWithErrorHandler<T extends (...args: any[]) => any>(
        fn: T,
        context: Omit<ErrorContext, 'operation'>,
        operation: string,
        level: ErrorLevel = ErrorLevel.ERROR
    ): (...args: Parameters<T>) => ReturnType<T> | undefined {
        return (...args: Parameters<T>): ReturnType<T> | undefined => {
            try {
                return fn(...args);
            } catch (error) {
                this.captureError(error, {
                    ...context,
                    operation,
                    data: { args }
                }, level);
                return undefined;
            }
        };
    }

    /**
     * 包装异步函数，为其添加错误处理
     */
    public wrapWithAsyncErrorHandler<T extends (...args: any[]) => Promise<any>>(
        fn: T,
        context: Omit<ErrorContext, 'operation'>,
        operation: string,
        level: ErrorLevel = ErrorLevel.ERROR
    ): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | undefined> {
        return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>> | undefined> => {
            try {
                return await fn(...args);
            } catch (error) {
                this.captureError(error, {
                    ...context,
                    operation,
                    data: { args }
                }, level);
                return undefined;
            }
        };
    }

    /**
     * 尝试执行函数，出错则返回默认值
     */
    public tryOrDefault<T>(
        fn: () => T,
        defaultValue: T,
        context: ErrorContext,
        level: ErrorLevel = ErrorLevel.WARNING
    ): T {
        try {
            return fn();
        } catch (error) {
            this.captureError(error, context, level);
            return defaultValue;
        }
    }

    /**
     * 尝试执行异步函数，出错则返回默认值
     */
    public async tryOrDefaultAsync<T>(
        fn: () => Promise<T>,
        defaultValue: T,
        context: ErrorContext,
        level: ErrorLevel = ErrorLevel.WARNING
    ): Promise<T> {
        try {
            return await fn();
        } catch (error) {
            this.captureError(error, context, level);
            return defaultValue;
        }
    }

    /**
     * 获取错误日志
     */
    public getErrorLogs(): ErrorLogEntry[] {
        return [...this.errorLogs];
    }

    /**
     * 清除错误日志
     */
    public clearErrorLogs(): void {
        this.errorLogs = [];
    }

    /**
     * 裁剪旧日志
     */
    private pruneOldLogs(): void {
        if (this.errorLogs.length > this.maxLogEntries) {
            this.errorLogs = this.errorLogs.slice(-this.maxLogEntries);
        }
    }

    /**
     * 标准化错误对象
     */
    private normalizeError(error: unknown): Error {
        if (error instanceof Error) {
            return error;
        }
        
        if (typeof error === 'string') {
            return new Error(error);
        }
        
        try {
            return new Error(JSON.stringify(error));
        } catch {
            return new Error('未知错误');
        }
    }

    /**
     * 输出到控制台
     */
    private logToConsole(entry: ErrorLogEntry): void {
        const timestamp = new Date(entry.timestamp).toISOString();
        const prefix = `[${entry.level}] [${timestamp}] [${entry.source}] [${entry.operation}]`;
        
        switch (entry.level) {
            case ErrorLevel.INFO:
                errorLogger.info(`${prefix} ${entry.message}`, entry.data || '');
                break;
            case ErrorLevel.WARNING:
                errorLogger.warn(`${prefix} ${entry.message}`, entry.data || '');
                break;
            case ErrorLevel.ERROR:
            case ErrorLevel.CRITICAL:
                errorLogger.error(`${prefix} ${entry.message}`, entry.error, entry.data || '');
                break;
        }
    }

    /**
     * 通用的重试操作逻辑
     * @param operation 要执行的操作函数
     * @param options 重试选项
     * @returns 操作结果或undefined（如果所有尝试都失败）
     */
    public async retryOperation<T>(
        operation: () => Promise<T>,
        options: {
            maxRetries: number,
            delayMs: number,
            context: ErrorContext,
            errorLevel?: ErrorLevel
        }
    ): Promise<T | undefined> {
        const { maxRetries, delayMs, context, errorLevel = ErrorLevel.WARNING } = options;
        let lastError: unknown;
        
        for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                if (attempt <= maxRetries) {
                    this.captureError(error, {
                        ...context,
                        operation: `${context.operation} (尝试 ${attempt}/${maxRetries + 1})`
                    }, ErrorLevel.WARNING);
                    
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }
        
        this.captureError(lastError, {
            ...context,
            operation: `${context.operation} (所有尝试都失败)`
        }, errorLevel);
        
        return undefined;
    }
}

// 导出单例实例
export const errorHandler = ErrorHandler.getInstance(); 