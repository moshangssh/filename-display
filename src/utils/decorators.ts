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
 * 使用ErrorHandler的retryOperation方法实现
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
            return await errorHandler.retryOperation(
                () => originalMethod.apply(this, args),
                {
                    maxRetries,
                    delayMs,
                    context: {
                        ...context,
                        operation: propertyKey.toString(),
                        data: { args, 'this': this }
                    },
                    errorLevel
                }
            );
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

/**
 * 缓存装饰器 - 自动缓存方法返回值
 * @param cacheKeyFn 可选的缓存键生成函数，未提供时使用参数值字符串
 */
export function Cacheable(cacheKeyFn?: (...args: any[]) => string) {
    return function(
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        
        descriptor.value = function(...args: any[]) {
            // 生成缓存键
            const cacheKey = cacheKeyFn 
                ? cacheKeyFn(...args) 
                : `${propertyKey}:${args.map(a => String(a)).join(',')}`;
                
            // 如果实例有fileDisplayCache属性
            if (this.fileDisplayCache && this.fileDisplayCache.has && this.fileDisplayCache.has(cacheKey)) {
                return this.fileDisplayCache.get(cacheKey);
            }
            
            // 调用原方法
            const result = originalMethod.apply(this, args);
            
            // 缓存结果（处理可能的Promise）
            if (result instanceof Promise) {
                return result.then(asyncResult => {
                    if (this.fileDisplayCache && this.fileDisplayCache.set && asyncResult) {
                        this.fileDisplayCache.set(cacheKey, asyncResult);
                    }
                    return asyncResult;
                });
            } else if (this.fileDisplayCache && this.fileDisplayCache.set && result) {
                this.fileDisplayCache.set(cacheKey, result);
            }
            
            return result;
        };
        
        return descriptor;
    };
}

/**
 * 日志装饰器 - 自动记录方法调用
 * @param level 日志级别
 */
export function Logged(level: 'debug' | 'info' | 'warn' | 'error' = 'debug') {
    return function(
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        
        descriptor.value = function(...args: any[]) {
            // 如果实例有logger属性
            if (this.logger && this.logger[level]) {
                const className = this.constructor.name || '未知类';
                this.logger[level](`${className}.${propertyKey} 被调用`, args.length > 0 ? args : '无参数');
            }
            
            try {
                const result = originalMethod.apply(this, args);
                
                // 处理可能的Promise结果
                if (result instanceof Promise) {
                    return result.catch(error => {
                        if (this.logger && this.logger.error) {
                            this.logger.error(`${propertyKey} 方法出错:`, error);
                        }
                        throw error;
                    });
                }
                
                return result;
            } catch (error) {
                if (this.logger && this.logger.error) {
                    this.logger.error(`${propertyKey} 方法出错:`, error);
                }
                throw error;
            }
        };
        
        return descriptor;
    };
} 