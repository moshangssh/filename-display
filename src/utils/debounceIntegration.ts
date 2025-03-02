import { debounce } from './debounce';
import { debounceRxJS, createDebouncedObservable } from './debounceRxJS';

// 防抖函数实现类型（用于配置）
export enum DebounceImplementation {
    CUSTOM = 'custom', // 自定义实现
    RXJS = 'rxjs'      // RxJS实现
}

// 当前使用的实现
let currentImplementation = DebounceImplementation.CUSTOM;

/**
 * 设置使用的防抖实现
 * @param implementation 实现类型
 */
export function setDebounceImplementation(implementation: DebounceImplementation): void {
    currentImplementation = implementation;
}

/**
 * 统一的防抖函数接口
 * 根据配置使用不同的实现
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
    if (currentImplementation === DebounceImplementation.RXJS) {
        return debounceRxJS(func, wait, immediate, name);
    } else {
        return debounce(func, wait, immediate, name);
    }
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

/**
 * 为了向后兼容helpers.ts中删除的函数
 * @deprecated 使用createUnifiedDebouncedFunction替代
 */
export function createDebouncedFunction<T extends (...args: any[]) => any>(
    func: T,
    name: string,
    wait: number,
    immediate = false
): {
    (...args: Parameters<T>): ReturnType<T> | undefined;
    cancel: () => void;
} {
    console.warn('createDebouncedFunction已废弃，请使用createUnifiedDebouncedFunction');
    return createUnifiedDebouncedFunction(func, name, wait, immediate);
}

// 导出Observable创建函数（仅RxJS特有功能）
export { createDebouncedObservable }; 