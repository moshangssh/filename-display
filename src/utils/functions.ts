/**
 * 通用工具函数集合
 */

/**
 * 节流函数 - 限制函数执行频率
 * @param func 要执行的函数
 * @param wait 等待时间（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: number | null = null;
    let lastExec = 0;

    return function(this: any, ...args: Parameters<T>) {
        const context = this;
        const now = Date.now();
        const remaining = wait - (now - lastExec);

        if (remaining <= 0 || remaining > wait) {
            lastExec = now;
            func.apply(context, args);
        } else if (!timeout) {
            timeout = window.setTimeout(() => {
                lastExec = Date.now();
                timeout = null;
                func.apply(context, args);
            }, remaining);
        }
    };
} 