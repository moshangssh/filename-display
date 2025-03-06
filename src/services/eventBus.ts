import { TFile } from 'obsidian';
import { debounceFn } from '../utils/debounceIntegration';

/**
 * 文件事件类型枚举
 */
export enum FileEventType {
    CREATE = 'create',
    MODIFY = 'modify',
    DELETE = 'delete',
    RENAME = 'rename',
    MOVE = 'move',
    ANY = 'any'
}

/**
 * 文件事件接口
 */
export interface FileEvent {
    type: FileEventType;
    file: TFile;
    oldPath?: string;
}

/**
 * 事件回调函数类型
 */
export type EventCallback = (event: FileEvent) => void;

/**
 * 事件总线配置
 */
export interface EventBusConfig {
    throttleTimeMs: number;
    debounceTimeMs: number;
}

/**
 * 节流函数
 */
function throttle(fn: Function, delay: number): Function {
    let lastCall = 0;
    return function(...args: any[]) {
        const now = Date.now();
        if (now - lastCall < delay) return;
        lastCall = now;
        return fn.apply(this, args);
    };
}

/**
 * 事件总线
 * 集中管理文件事件的发布与订阅
 */
export class EventBus {
    private listeners: Map<FileEventType, Set<EventCallback>> = new Map();
    private config: EventBusConfig;
    
    constructor(config: EventBusConfig = { throttleTimeMs: 300, debounceTimeMs: 500 }) {
        this.config = config;
        this.initializeListeners();
    }
    
    private initializeListeners(): void {
        // 初始化每种事件类型的监听器集合
        Object.values(FileEventType).forEach(type => {
            this.listeners.set(type, new Set());
        });
    }
    
    /**
     * 注册事件监听器
     */
    public on(type: FileEventType, callback: EventCallback): () => void {
        const listeners = this.listeners.get(type);
        if (!listeners) return () => {};
        
        // 根据事件类型应用不同的性能优化
        let wrappedCallback: EventCallback;
        if (type === FileEventType.CREATE || type === FileEventType.MODIFY) {
            wrappedCallback = throttle(callback, this.config.throttleTimeMs) as EventCallback;
        } else {
            wrappedCallback = debounceFn(callback, this.config.debounceTimeMs) as EventCallback;
        }
        
        listeners.add(wrappedCallback);
        
        // 返回取消订阅函数
        return () => {
            listeners.delete(wrappedCallback);
        };
    }
    
    /**
     * 触发文件事件
     */
    public emit(event: FileEvent): void {
        // 获取特定事件类型的监听器
        const typeListeners = this.listeners.get(event.type);
        // 获取通用事件类型的监听器
        const anyListeners = this.listeners.get(FileEventType.ANY);
        
        // 组合所有要通知的监听器
        const allCallbacks = new Set<EventCallback>();
        
        if (typeListeners) {
            typeListeners.forEach(cb => allCallbacks.add(cb));
        }
        
        if (anyListeners) {
            anyListeners.forEach(cb => allCallbacks.add(cb));
        }
        
        // 通知所有监听器
        for (const callback of allCallbacks) {
            try {
                callback(event);
            } catch (error) {
                console.error('事件处理器执行失败:', error);
            }
        }
    }
    
    /**
     * 清理所有监听器
     */
    public clear(): void {
        this.listeners.forEach(listeners => listeners.clear());
    }
    
    /**
     * 获取监听器统计信息
     */
    public getStats(): { [key in FileEventType]?: number } {
        const result: { [key in FileEventType]?: number } = {};
        
        this.listeners.forEach((listeners, type) => {
            result[type] = listeners.size;
        });
        
        return result;
    }
} 