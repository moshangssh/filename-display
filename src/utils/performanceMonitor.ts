/**
 * 性能监控工具函数
 * 用于简化代码中重复的性能监控逻辑
 */

/**
 * 创建性能标记
 * @param name 标记名称
 */
export function markPerformance(name: string): void {
    if (typeof performance !== 'undefined' && performance.mark) {
        performance.mark(name);
    }
}

/**
 * 测量两个标记之间的性能
 * @param measureName 测量名称
 * @param startMarkName 开始标记名称
 * @param endMarkName 结束标记名称
 * @returns 测量结果(毫秒)或undefined
 */
export function measurePerformance(
    measureName: string,
    startMarkName: string,
    endMarkName: string
): number | undefined {
    if (typeof performance !== 'undefined' && performance.measure) {
        try {
            performance.measure(measureName, startMarkName, endMarkName);
            
            const entries = performance.getEntriesByName(measureName);
            if (entries.length > 0) {
                return entries[0].duration;
            }
        } catch (e) {
            // 忽略性能测量错误
        }
    }
    return undefined;
}

/**
 * 创建防抖函数的性能标记名称
 * @param functionName 函数名称
 * @param type 标记类型
 * @returns 标记名称
 */
export function getDebounceMarkName(functionName: string, type: 'start' | 'end'): string {
    return `debounce:${functionName}:${type}`;
}

/**
 * 开始防抖函数性能监控
 * @param functionName 函数名称
 * @returns 开始标记名称
 */
export function startDebouncePerformance(functionName: string): string {
    const startMarkName = getDebounceMarkName(functionName, 'start');
    markPerformance(startMarkName);
    return startMarkName;
}

/**
 * 结束防抖函数性能监控
 * @param functionName 函数名称
 * @param startMarkName 开始标记名称
 */
export function endDebouncePerformance(functionName: string, startMarkName: string): void {
    const endMarkName = getDebounceMarkName(functionName, 'end');
    markPerformance(endMarkName);
    measurePerformance(`debounce:${functionName}`, startMarkName, endMarkName);
} 