import { ErrorLevel, ErrorContext } from '../../utils/ErrorHandler';

/**
 * 错误处理服务接口
 */
export interface IErrorHandler {
    /**
     * 捕获并处理错误
     */
    captureError(
        error: unknown,
        context: ErrorContext,
        level?: ErrorLevel
    ): void;
    
    /**
     * 包装函数，为其添加错误处理
     */
    wrapWithErrorHandler<T extends (...args: any[]) => any>(
        fn: T,
        context: Omit<ErrorContext, 'operation'>,
        operation: string,
        level?: ErrorLevel
    ): (...args: Parameters<T>) => ReturnType<T> | undefined;
    
    /**
     * 包装异步函数，为其添加错误处理
     */
    wrapWithAsyncErrorHandler<T extends (...args: any[]) => Promise<any>>(
        fn: T,
        context: Omit<ErrorContext, 'operation'>,
        operation: string,
        level?: ErrorLevel
    ): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | undefined>;
    
    /**
     * 尝试执行函数，出错则返回默认值
     */
    tryOrDefault<T>(
        fn: () => T,
        defaultValue: T,
        context: ErrorContext,
        level?: ErrorLevel
    ): T;
    
    /**
     * 尝试执行异步函数，出错则返回默认值
     */
    tryOrDefaultAsync<T>(
        fn: () => Promise<T>,
        defaultValue: T,
        context: ErrorContext,
        level?: ErrorLevel
    ): Promise<T>;
    
    /**
     * 设置是否显示通知
     */
    setShowNotifications(show: boolean): void;
    
    /**
     * 获取错误日志
     */
    getErrorLogs(): any[];
    
    /**
     * 清除错误日志
     */
    clearErrorLogs(): void;
} 