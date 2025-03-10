import { ITimerService } from './interfaces/IServices';
import { Logger } from '../utils/logger';

const logger = new Logger('TimerService');

/**
 * 定时器服务，管理所有定时器并提供统一清理机制
 */
export class TimerService implements ITimerService {
    // 存储所有计时器ID
    private timers: Set<number> = new Set();
    // 存储所有IdleCallback ID
    private idleCallbacks: Set<number> = new Set();

    /**
     * 设置延时定时器
     */
    public setTimeout(callback: () => void, delay: number): number {
        try {
            const timerId = window.setTimeout(() => {
                this.timers.delete(timerId);
                callback();
            }, delay);
            
            this.timers.add(timerId);
            return timerId;
        } catch (error) {
            logger.error('设置定时器失败', error);
            throw error;
        }
    }

    /**
     * 设置循环定时器
     */
    public setInterval(callback: () => void, delay: number): number {
        try {
            const timerId = window.setInterval(callback, delay);
            this.timers.add(timerId);
            return timerId;
        } catch (error) {
            logger.error('设置循环定时器失败', error);
            throw error;
        }
    }

    /**
     * 清除延时定时器
     */
    public clearTimeout(id: number): void {
        try {
            window.clearTimeout(id);
            this.timers.delete(id);
        } catch (error) {
            logger.error(`清除定时器 ${id} 失败`, error);
        }
    }

    /**
     * 清除循环定时器
     */
    public clearInterval(id: number): void {
        try {
            window.clearInterval(id);
            this.timers.delete(id);
        } catch (error) {
            logger.error(`清除循环定时器 ${id} 失败`, error);
        }
    }

    /**
     * 设置空闲回调
     */
    public requestIdleCallback(callback: () => void): number {
        try {
            // 判断浏览器是否支持 requestIdleCallback
            if ('requestIdleCallback' in window) {
                const id = window.requestIdleCallback(() => {
                    this.idleCallbacks.delete(id);
                    callback();
                });
                this.idleCallbacks.add(id);
                return id;
            } else {
                // 如果不支持，降级为setTimeout
                return this.setTimeout(callback, 1);
            }
        } catch (error) {
            logger.error('设置空闲回调失败', error);
            throw error;
        }
    }

    /**
     * 取消空闲回调
     */
    public cancelIdleCallback(id: number): void {
        try {
            if ('cancelIdleCallback' in window) {
                window.cancelIdleCallback(id);
            } else {
                this.clearTimeout(id);
            }
            this.idleCallbacks.delete(id);
        } catch (error) {
            logger.error(`取消空闲回调 ${id} 失败`, error);
        }
    }

    /**
     * 清除所有定时器
     */
    public clearAll(): void {
        try {
            // 清除所有定时器
            this.timers.forEach(id => {
                window.clearTimeout(id);
                window.clearInterval(id);
            });
            this.timers.clear();

            // 清除所有空闲回调
            if ('cancelIdleCallback' in window) {
                this.idleCallbacks.forEach(id => {
                    window.cancelIdleCallback(id);
                });
            } else {
                this.idleCallbacks.forEach(id => {
                    window.clearTimeout(id);
                });
            }
            this.idleCallbacks.clear();
            
            logger.log('已清除所有定时器和空闲回调');
        } catch (error) {
            logger.error('清除所有定时器失败', error);
        }
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        this.clearAll();
    }
} 