import { 
    Observable, 
    Subject, 
    debounceTime, 
    distinctUntilChanged, 
    tap, 
    share,
    takeUntil,
    first,
    publishReplay,
    refCount
} from 'rxjs';
import { startDebouncePerformance, endDebouncePerformance } from './performanceMonitor';

/**
 * 创建基于RxJS的防抖Observable
 * 
 * @param wait 等待时间(毫秒)
 * @param immediate 是否立即发出第一个值
 * @param name 可选的函数名称(用于性能监控)
 * @returns 一个可供订阅的Observable和控制函数
 */
export function createDebouncedObservable<T>(
    wait: number,
    immediate = false, 
    name?: string
): {
    observable: Observable<T>;
    next: (value: T) => void;
    complete: () => void;
    cancel: () => void;
} {
    const input$ = new Subject<T>();
    const cancel$ = new Subject<void>();
    const functionName = name || 'rxjs-debounce';
    
    // 主Observable
    let observable = input$.pipe(
        tap(() => startDebouncePerformance(functionName)),
        debounceTime(wait),
        distinctUntilChanged(),
        tap(() => endDebouncePerformance(functionName, `debounce:${functionName}:start`)),
        takeUntil(cancel$),
        share()
    );
    
    // 处理立即执行模式
    if (immediate) {
        // 创建立即响应的Observable
        const immediate$ = input$.pipe(
            first(),
            tap(() => endDebouncePerformance(`${functionName}-immediate`, `debounce:${functionName}:start`))
        );
        
        // 合并两个流
        const sharedInput$ = input$.pipe(publishReplay(1), refCount());
        sharedInput$.subscribe(); // 确保连接建立
        
        // 返回立即值和后续防抖值
        immediate$.subscribe(); // 激活立即响应
        
        // 仍然返回原始observable，因为immediate$只是一个副作用
    }
    
    return {
        observable, 
        next: (value: T) => input$.next(value),
        complete: () => input$.complete(),
        cancel: () => cancel$.next()
    };
}

/**
 * 创建基于RxJS的防抖函数
 * 通过使用createDebouncedObservable简化实现
 * 
 * @param func 要执行的函数
 * @param wait 等待时间(毫秒)
 * @param immediate 是否立即执行第一次调用
 * @param name 可选的函数名称(用于性能监控)
 * @returns 防抖处理后的函数
 */
export function debounceRxJS<T extends (...args: any[]) => any>(
    func: T, 
    wait: number,
    immediate = false,
    name?: string
): {
    (...args: Parameters<T>): ReturnType<T> | undefined;
    cancel: () => void;
} {
    const functionName = name || func.name || 'anonymous';
    
    // 创建参数流和控制器
    const { 
        observable: args$, 
        next: sendArgs,
        cancel
    } = createDebouncedObservable<{
        args: Parameters<T>;
        context: any;
    }>(wait, false, functionName); // 不在Observable层面处理立即执行
    
    let lastResult: ReturnType<T> | undefined;
    let isFirstCall = true; // 追踪是否是第一次调用
    
    // 订阅参数流并执行函数
    args$.subscribe({
        next: ({ args, context }) => {
            lastResult = func.apply(context, args);
        }
    });
    
    // 主函数
    const debounced = function(this: any, ...args: Parameters<T>): ReturnType<T> | undefined {
        // 如果是立即执行模式且是第一次调用，直接执行
        if (immediate && isFirstCall) {
            isFirstCall = false;
            lastResult = func.apply(this, args);
        }
        
        // 发送参数到流
        sendArgs({ args, context: this });
        return lastResult;
    };
    
    // 添加取消方法
    debounced.cancel = cancel;
    
    return debounced;
} 