import { TFile, normalizePath, Notice } from 'obsidian';

/**
 * 插件日志前缀
 */
const LOG_PREFIX = '[文件名显示]';

/**
 * 记录调试日志
 * @param message 日志消息
 * @param data 可选的额外数据
 */
export function log(message: string, data?: any, isError: boolean = false): void {
    const prefix = isError ? '错误' : '调试';
    const timestamp = new Date().toISOString();
    console[isError ? 'error' : 'log'](`${LOG_PREFIX} [${timestamp}] [${prefix}] ${message}`, data || '');
}

/**
 * 显示通知
 * @param message 通知消息
 * @param timeout 显示时间(毫秒)
 */
export function showNotice(message: string, timeout: number = 3000): Notice {
    return new Notice(message, timeout);
}

/**
 * 安全地执行正则表达式
 * 防止无效的正则表达式导致错误
 * 
 * @param pattern 正则表达式模式
 * @param input 输入字符串
 * @returns 匹配结果或null
 */
export function safeRegExMatch(pattern: string, input: string): RegExpMatchArray | null {
    try {
        const regex = new RegExp(pattern);
        return input.match(regex);
    } catch (error) {
        log('正则表达式错误', error, true);
        return null;
    }
}

/**
 * 检查正则表达式是否有效
 * @param pattern 正则表达式模式
 * @returns 是否有效
 */
export function isValidRegEx(pattern: string): boolean {
    try {
        new RegExp(pattern);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * 获取文件名，不含扩展名
 * @param file 文件对象
 * @returns 不含扩展名的文件名
 */
export function getFileNameWithoutExtension(file: TFile): string {
    return file.basename;
}

/**
 * 根据捕获组和模式从文件名中提取显示名称
 * @param fileName 原始文件名
 * @param pattern 正则表达式模式
 * @param captureGroup 捕获组索引
 * @param fallbackText 提取失败时的回退文本
 * @returns 提取的显示名称
 */
export function extractDisplayName(
    fileName: string,
    pattern: string,
    captureGroup: number,
    fallbackText: string = fileName
): string {
    try {
        const match = safeRegExMatch(pattern, fileName);
        
        if (match && captureGroup >= 0 && captureGroup < match.length) {
            const result = match[captureGroup];
            return result?.trim() || getFallbackName(fileName);
        }
        
        return getFallbackName(fileName);
    } catch (error) {
        log('文件名处理错误', error, true);
        return getFallbackName(fileName);
    }
}

/**
 * 获取回退显示名称
 * @param originalName 原始名称
 * @param maxLength 最大长度
 * @returns 处理后的回退名称
 */
export function getFallbackName(originalName: string, maxLength: number = 30): string {
    if (originalName.length > maxLength) {
        return originalName.substring(0, maxLength - 3) + '...';
    }
    return originalName;
}

/**
 * 创建性能标记
 * 用于性能监控
 * 
 * @param name 标记名称
 */
export function markPerformance(name: string): void {
    if (typeof performance !== 'undefined' && performance.mark) {
        performance.mark(`${LOG_PREFIX}:${name}`);
    }
}

/**
 * 测量两个标记之间的性能
 * @param startMark 开始标记名称
 * @param endMark 结束标记名称
 * @param logResult 是否记录结果
 * @returns 测量结果(毫秒)
 */
export function measurePerformance(
    startMark: string,
    endMark: string,
    logResult: boolean = true
): number | undefined {
    if (typeof performance !== 'undefined' && performance.measure) {
        try {
            const measureName = `${LOG_PREFIX}:${startMark}-to-${endMark}`;
            performance.measure(measureName, `${LOG_PREFIX}:${startMark}`, `${LOG_PREFIX}:${endMark}`);
            
            const entries = performance.getEntriesByName(measureName);
            if (entries.length > 0) {
                const duration = entries[0].duration;
                if (logResult) {
                    log(`性能: ${startMark} 到 ${endMark} = ${duration.toFixed(2)}ms`);
                }
                return duration;
            }
        } catch (error) {
            log('性能测量失败', error, true);
        }
    }
    return undefined;
}

/**
 * 等待指定时间
 * @param ms 等待时间(毫秒)
 * @returns Promise
 */
export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 检查字符串是否为空或仅包含空白
 * @param str 输入字符串
 * @returns 是否为空
 */
export function isEmptyString(str: string | null | undefined): boolean {
    return str === null || str === undefined || str.trim() === '';
}

/**
 * 安全地获取DOM元素文本内容
 * @param element DOM元素
 * @param defaultValue 默认值
 * @returns 文本内容
 */
export function safeGetTextContent(element: HTMLElement | null, defaultValue: string = ''): string {
    if (!element) return defaultValue;
    return element.textContent || defaultValue;
}

/**
 * 为文件路径添加后缀
 * @param path 原始路径
 * @param suffix 后缀
 * @returns 新路径
 */
export function addSuffixToPath(path: string, suffix: string): string {
    const lastDotIndex = path.lastIndexOf('.');
    if (lastDotIndex < 0) return `${path}${suffix}`;
    
    return `${path.substring(0, lastDotIndex)}${suffix}${path.substring(lastDotIndex)}`;
}

/**
 * 将文件路径规范化并验证
 * @param path 文件路径
 * @returns 规范化的路径或null
 */
export function normalizeAndValidatePath(path: string): string | null {
    try {
        return normalizePath(path);
    } catch (error) {
        log('路径规范化失败', error, true);
        return null;
    }
}

/**
 * 获取文件路径的文件夹部分
 * @param path 文件路径
 * @returns 文件夹路径
 */
export function getFolderPathFromFilePath(path: string): string {
    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex < 0) return '';
    return path.substring(0, lastSlashIndex);
}

/**
 * 创建防抖函数的包装器
 * 带有性能监控功能
 * 
 * @param func 要执行的函数
 * @param name 函数名(用于日志)
 * @param wait 等待时间(毫秒)
 * @returns 防抖处理后的函数
 */
export function createDebouncedFunction<T extends (...args: any[]) => any>(
    func: T,
    name: string,
    wait: number
): (...args: Parameters<T>) => void {
    let callCount = 0;
    let lastExecutionTime = Date.now();
    
    // 导入防抖函数
    const { debounce } = require('./debounce');
    
    const debouncedFunc = debounce(
        (...args: Parameters<T>) => {
            callCount++;
            const now = Date.now();
            const timeSinceLastExecution = now - lastExecutionTime;
            
            if (timeSinceLastExecution > 60000) { // 每分钟记录一次
                log(`${name} 在过去的分钟内被调用了 ${callCount} 次`);
                callCount = 0;
                lastExecutionTime = now;
            }
            
            // 调用原始函数
            markPerformance(`${name}:start`);
            func(...args);
            markPerformance(`${name}:end`);
            measurePerformance(`${name}:start`, `${name}:end`);
        },
        wait
    );
    
    return debouncedFunc;
} 
