import { debounceRxJS, createDebouncedObservable } from './debounceRxJS';

/**
 * 统一的防抖函数接口
 * 使用RxJS实现
 * 
 * @param func 要执行的函数
 * @param wait 等待时间(毫秒)
 * @param immediate 是否立即执行第一次调用
 * @param name 可选的函数名称(用于性能监控)
 * @returns 防抖处理后的函数
 */
export function debounceFn<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    immediate = false,
    name?: string
): {
    (...args: Parameters<T>): ReturnType<T> | undefined;
    cancel: () => void;
} {
    return debounceRxJS(func, wait, immediate, name);
}

/**
 * 创建统一的防抖函数包装器
 * 保持与helpers.ts中createDebouncedFunction相同的接口
 * 
 * @param func 要执行的函数
 * @param name 函数名(用于日志和性能监控)
 * @param wait 等待时间(毫秒)
 * @param immediate 是否立即执行第一次调用
 * @returns 防抖处理后的函数
 */
export function createUnifiedDebouncedFunction<T extends (...args: any[]) => any>(
    func: T,
    name: string,
    wait: number,
    immediate = false
): {
    (...args: Parameters<T>): ReturnType<T> | undefined;
    cancel: () => void;
} {
    return debounceFn(func, wait, immediate, name);
}

export { createDebouncedObservable }; 