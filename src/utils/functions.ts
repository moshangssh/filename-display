/**
 * 通用工具函数集合
 */

import { ITimerService } from '../services/interfaces/IServices';

/**
 * 节流函数 - 限制函数执行频率
 * @param func 要执行的函数
 * @param wait 等待时间（毫秒）
 * @param timerService 可选的TimerService实例，如不提供则直接使用window的计时器
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    timerService?: ITimerService
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
            const callback = () => {
                lastExec = Date.now();
                timeout = null;
                func.apply(context, args);
            };
            
            if (timerService) {
                timeout = timerService.setTimeout(callback, remaining);
            } else {
                timeout = window.setTimeout(callback, remaining);
            }
        }
    };
} 