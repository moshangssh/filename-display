import { errorHandler, ErrorContext, ErrorLevel } from './ErrorHandler';

/**
 * 方法错误捕获装饰器
 * 用于包装类方法，为其添加统一的错误处理
 */
export function CatchError(
    context: Omit<ErrorContext, 'operation'>,
    errorLevel: ErrorLevel = ErrorLevel.ERROR
) {
    return function (
        target: Object,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        
        // 确保是一个方法
        if (typeof originalMethod !== 'function') {
            return descriptor;
        }
        
        // 重写方法以添加错误处理
        if (originalMethod.constructor.name === 'AsyncFunction') {
            // 处理异步方法
            descriptor.value = async function(...args: any[]) {
                try {
                    return await originalMethod.apply(this, args);
                } catch (error) {
                    errorHandler.captureError(error, {
                        ...context,
                        operation: propertyKey.toString(),
                        data: { args, 'this': this }
                    }, errorLevel);
                    return undefined;
                }
            };
        } else {
            // 处理同步方法
            descriptor.value = function(...args: any[]) {
                try {
                    return originalMethod.apply(this, args);
                } catch (error) {
                    errorHandler.captureError(error, {
                        ...context,
                        operation: propertyKey.toString(),
                        data: { args, 'this': this }
                    }, errorLevel);
                    return undefined;
                }
            };
        }
        
        return descriptor;
    };
}

/**
 * 异步方法重试装饰器
 * 当方法失败时自动重试指定次数
 */
export function RetryAsync(
    maxRetries: number = 3,
    delayMs: number = 500,
    context: Omit<ErrorContext, 'operation'>,
    errorLevel: ErrorLevel = ErrorLevel.WARNING
) {
    return function (
        target: Object,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        
        // 确保是一个异步方法
        if (typeof originalMethod !== 'function') {
            return descriptor;
        }
        
        // 重写方法以添加重试逻辑
        descriptor.value = async function(...args: any[]) {
            let lastError: unknown;
            
            for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
                try {
                    return await originalMethod.apply(this, args);
                } catch (error) {
                    lastError = error;
                    
                    if (attempt <= maxRetries) {
                        // 记录警告但继续重试
                        errorHandler.captureError(error, {
                            ...context,
                            operation: `${propertyKey.toString()} (尝试 ${attempt}/${maxRetries + 1})`,
                            data: { args, 'this': this }
                        }, ErrorLevel.WARNING);
                        
                        // 等待指定时间后重试
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                }
            }
            
            // 所有重试都失败，记录最终错误
            errorHandler.captureError(lastError, {
                ...context,
                operation: `${propertyKey.toString()} (所有尝试都失败)`,
                data: { args, 'this': this }
            }, errorLevel);
            
            return undefined;
        };
        
        return descriptor;
    };
}

/**
 * 为类方法添加计时功能，并记录执行时间
 */
export function LogExecutionTime(
    context: Omit<ErrorContext, 'operation'>,
    warnThresholdMs: number = 1000  // 超过此阈值会记录警告
) {
    return function (
        target: Object,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        
        // 确保是一个方法
        if (typeof originalMethod !== 'function') {
            return descriptor;
        }
        
        // 处理异步方法
        if (originalMethod.constructor.name === 'AsyncFunction') {
            descriptor.value = async function(...args: any[]) {
                const start = performance.now();
                try {
                    return await originalMethod.apply(this, args);
                } finally {
                    const duration = performance.now() - start;
                    const level = duration > warnThresholdMs ? ErrorLevel.WARNING : ErrorLevel.INFO;
                    
                    errorHandler.captureError(`执行时间: ${duration.toFixed(2)}ms`, {
                        ...context,
                        operation: `${propertyKey.toString()} 执行时间`,
                        data: { duration, args }
                    }, level);
                }
            };
        } else {
            // 处理同步方法
            descriptor.value = function(...args: any[]) {
                const start = performance.now();
                try {
                    return originalMethod.apply(this, args);
                } finally {
                    const duration = performance.now() - start;
                    const level = duration > warnThresholdMs ? ErrorLevel.WARNING : ErrorLevel.INFO;
                    
                    errorHandler.captureError(`执行时间: ${duration.toFixed(2)}ms`, {
                        ...context,
                        operation: `${propertyKey.toString()} 执行时间`,
                        data: { duration, args }
                    }, level);
                }
            };
        }
        
        return descriptor;
    };
} 