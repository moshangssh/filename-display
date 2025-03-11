import { ILoggerService } from './interfaces/IServices';

/**
 * 集中式日志服务，提供统一的日志记录功能
 * 使用依赖注入模式，可以在整个应用中共享
 */
export class LoggerService implements ILoggerService {
    private prefix: string;
    private isDev: boolean;

    constructor(prefix: string = 'FilenameDisplay') {
        this.prefix = prefix ? `[${prefix}] ` : '';
        this.isDev = process.env.NODE_ENV === 'development';
    }

    /**
     * 记录一般日志信息
     */
    log(message: string, ...args: any[]): void {
        if (this.isDev) {
            console.log(this.prefix + message, ...args);
        }
    }

    /**
     * 记录错误信息
     */
    error(message: string, ...args: any[]): void {
        if (this.isDev) {
            console.error(this.prefix + message, ...args);
        }
    }

    /**
     * 记录警告信息
     */
    warn(message: string, ...args: any[]): void {
        if (this.isDev) {
            console.warn(this.prefix + message, ...args);
        }
    }

    /**
     * 记录信息性消息
     */
    info(message: string, ...args: any[]): void {
        if (this.isDev) {
            console.info(this.prefix + message, ...args);
        }
    }

    /**
     * 记录调试信息
     */
    debug(message: string, ...args: any[]): void {
        if (this.isDev) {
            console.debug(this.prefix + message, ...args);
        }
    }

    /**
     * 创建一个带有特定前缀的子日志记录器
     * 这允许各个服务有自己的日志标识，同时仍使用同一个日志服务实例
     */
    getLogger(prefix: string): ILoggerService {
        return new LoggerService(prefix);
    }

    /**
     * 释放日志服务资源
     */
    dispose(): void {
        // 目前无需特殊资源清理
        if (this.isDev) {
            console.log(this.prefix + '日志服务资源已释放');
        }
    }
} 