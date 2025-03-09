// 日志工具服务，提供统一的日志记录功能
// 判断是否为开发环境，只有在开发环境下才输出日志
const isDev = process.env.NODE_ENV === 'development';

export class Logger {
    private prefix: string;

    constructor(prefix: string = '') {
        this.prefix = prefix ? `[${prefix}] ` : '';
    }

    log(...args: any[]): void {
        if (isDev) {
            console.log(this.prefix, ...args);
        }
    }

    error(...args: any[]): void {
        if (isDev) {
            console.error(this.prefix, ...args);
        }
    }

    warn(...args: any[]): void {
        if (isDev) {
            console.warn(this.prefix, ...args);
        }
    }

    info(...args: any[]): void {
        if (isDev) {
            console.info(this.prefix, ...args);
        }
    }
}

// 默认实例，可以直接导入使用
export const logger = new Logger('FilenameDisplay'); 