/**
 * 防抖函数集成模块
 * 提供统一的防抖函数接口
 */

type DebouncedFunction<T extends (...args: any[]) => any> = T & {
    cancel: () => void;
};

/**
 * 创建防抖函数
 * 使用原生JavaScript实现
 * 
 * @param func 要执行的函数 
 * @param wait 等待时间(毫秒)，默认300ms
 * @param immediate 是否立即执行第一次调用
 * @param name 可选的函数名称(用于性能监控)
 * @returns 防抖处理后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number = 300,
    immediate: boolean = false,
    name?: string
): DebouncedFunction<T> {
    let timeout: NodeJS.Timeout | null = null;
    let result: any;

    const debounced = function(this: any, ...args: any[]) {
        const context = this;

        const later = function() {
            timeout = null;
            if (!immediate) result = func.apply(context, args);
        };

        const callNow = immediate && !timeout;

        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(later, wait);

        if (callNow) result = func.apply(context, args);

        return result;
    } as T;

    (debounced as DebouncedFunction<T>).cancel = function() {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
    };

    return debounced as DebouncedFunction<T>;
}

// 导出同一个实现供所有地方使用
// debounceFn函数接口 - 保持与原有实现兼容
export const debounceFn = debounce;

// createUnifiedDebouncedFunction接口 - 保持与helpers.ts中createDebouncedFunction相同的接口
// 参数顺序不同：(func, name, wait, immediate) vs (func, wait, immediate, name)
export function createUnifiedDebouncedFunction<T extends (...args: any[]) => any>(
    func: T,
    name: string,
    wait: number,
    immediate = false
): DebouncedFunction<T> {
    return debounce(func, wait, immediate, name);
} 