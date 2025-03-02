import { startDebouncePerformance, endDebouncePerformance } from './performanceMonitor';

/**
 * 创建一个防抖函数
 * 在指定等待时间内，如果函数被重复调用，则只在最后一次调用后执行
 * 
 * @param func 要执行的函数
 * @param wait 等待时间(毫秒)
 * @param immediate 是否立即执行第一次调用
 * @param name 可选的函数名称(用于性能监控)
 * @returns 防抖处理后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T, 
    wait: number,
    immediate = false,
    name?: string
): {
    (...args: Parameters<T>): ReturnType<T> | undefined;
    cancel: () => void;
} {
    let timeout: NodeJS.Timeout | null = null;
    let result: ReturnType<T> | undefined;
    
    // 创建主函数
    const debounced = function(this: any, ...args: Parameters<T>): ReturnType<T> | undefined {
        // 用于性能监控
        const functionName = name || func.name || 'anonymous';
        const startMarkName = startDebouncePerformance(functionName);
        
        // 保存上下文
        const context = this;
        
        // 清除之前的定时器
        if (timeout !== null) {
            clearTimeout(timeout);
        }
        
        // 如果是立即执行模式且没有活动的定时器
        if (immediate && timeout === null) {
            result = func.apply(context, args);
            endDebouncePerformance(functionName, startMarkName);
            
            timeout = setTimeout(() => {
                timeout = null;
            }, wait);
        } else {
            // 设置新的定时器
            timeout = setTimeout(() => {
                result = func.apply(context, args);
                timeout = null;
                endDebouncePerformance(functionName, startMarkName);
            }, wait);
        }
        
        return result;
    };
    
    // 添加取消方法
    debounced.cancel = function() {
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }
    };
    
    return debounced;
}  
