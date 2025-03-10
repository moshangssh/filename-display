// 日志工具服务，提供统一的日志记录功能
// 判断是否为开发环境，只有在开发环境下才输出日志
import { ILoggerService } from '../services/interfaces/IServices';

const isDev = process.env.NODE_ENV === 'development';

export class Logger implements ILoggerService {
    private prefix: string;

    constructor(prefix: string = '') {
        this.prefix = prefix ? `[${prefix}] ` : '';
    }

    log(message: string, ...args: any[]): void {
        if (isDev) {
            console.log(this.prefix + message, ...args);
        }
    }

    error(message: string, ...args: any[]): void {
        if (isDev) {
            console.error(this.prefix + message, ...args);
        }
    }

    warn(message: string, ...args: any[]): void {
        if (isDev) {
            console.warn(this.prefix + message, ...args);
        }
    }

    info(message: string, ...args: any[]): void {
        if (isDev) {
            console.info(this.prefix + message, ...args);
        }
    }

    // 创建一个带有特定前缀的子日志记录器
    getLogger(prefix: string): ILoggerService {
        return new Logger(prefix);
    }
}

// 默认实例，可以直接导入使用
export const logger = new Logger('FilenameDisplay'); 