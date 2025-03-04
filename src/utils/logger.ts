/**
 * 日志工具函数
 */
export function log(message: string, error?: any, isError: boolean = false): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    
    if (isError) {
        console.error(logMessage);
        if (error) {
            console.error(error);
        }
    } else {
        console.log(logMessage);
        if (error) {
            console.log(error);
        }
    }
}

// 导出类型声明
export type LogFunction = typeof log; 