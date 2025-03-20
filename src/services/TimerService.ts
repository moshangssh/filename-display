import { ITimerService } from './interfaces/IServices';
import { Plugin } from 'obsidian';
import { LoggerService } from "../services/LoggerService";

const logger = new LoggerService('TimerService');

/**
 * 定时器服务，简化实现，利用Obsidian Plugin类的registerInterval方法
 * 减少错误处理，提供统一的资源管理
 */
export class TimerService implements ITimerService {
    // 存储所有计时器ID
    private timers: Set<number> = new Set();
    // 存储所有IdleCallback ID
    private idleCallbacks: Set<number> = new Set();
    // 插件实例
    private plugin: Plugin;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    /**
     * 设置延时定时器
     */
    public setTimeout(callback: () => void, delay: number): number {
        const timerId = window.setTimeout(() => {
            this.timers.delete(timerId);
            callback();
        }, delay);
        
        this.timers.add(timerId);
        
        // 如果有插件实例，使用registerInterval注册以便自动清理
        if (this.plugin) {
            this.plugin.registerInterval(timerId);
        }
        
        return timerId;
    }

    /**
     * 设置循环定时器
     */
    public setInterval(callback: () => void, delay: number): number {
        const timerId = window.setInterval(callback, delay);
        this.timers.add(timerId);
        
        // 如果有插件实例，使用registerInterval注册以便自动清理
        if (this.plugin) {
            this.plugin.registerInterval(timerId);
        }
        
        return timerId;
    }

    /**
     * 清除延时定时器
     */
    public clearTimeout(id: number): void {
        window.clearTimeout(id);
        this.timers.delete(id);
    }

    /**
     * 清除循环定时器
     */
    public clearInterval(id: number): void {
        window.clearInterval(id);
        this.timers.delete(id);
    }

    /**
     * 设置空闲回调
     */
    public requestIdleCallback(callback: () => void): number {
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
    }

    /**
     * 取消空闲回调
     */
    public cancelIdleCallback(id: number): void {
        if ('cancelIdleCallback' in window) {
            window.cancelIdleCallback(id);
        } else {
            this.clearTimeout(id);
        }
        this.idleCallbacks.delete(id);
    }

    /**
     * 清除所有定时器
     * 注意：通过registerInterval注册的计时器会在插件卸载时自动清理
     * 此方法主要用于手动清理其他计时器
     */
    public clearAll(): void {
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
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        this.clearAll();
    }
} 