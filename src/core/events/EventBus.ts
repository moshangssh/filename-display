/**
 * 事件总线类
 * 提供简单的发布-订阅机制来解耦组件间的依赖
 */
export class EventBus {
    private static instance: EventBus;
    private listeners: Map<string, Function[]> = new Map();
    
    /**
     * 获取EventBus单例
     */
    static getInstance(): EventBus {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }
    
    /**
     * 私有构造函数，确保单例模式
     */
    private constructor() {
        // 私有构造函数，防止直接实例化
    }
    
    /**
     * 订阅事件
     * @param event 事件名称
     * @param callback 回调函数
     * @returns 取消订阅的函数
     */
    subscribe(event: string, callback: Function): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        
        const callbacks = this.listeners.get(event)!;
        callbacks.push(callback);
        
        // 返回取消订阅的函数
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        };
    }
    
    /**
     * 发布事件
     * @param event 事件名称
     * @param args 事件参数
     */
    publish(event: string, ...args: any[]): void {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(callback => {
            try {
                callback(...args);
            } catch (error) {
                console.error(`EventBus: 执行事件 ${event} 的回调时发生错误:`, error);
            }
        });
    }
    
    /**
     * 检查事件是否有订阅者
     * @param event 事件名称
     * @returns 是否有订阅者
     */
    hasSubscribers(event: string): boolean {
        const callbacks = this.listeners.get(event);
        return callbacks !== undefined && callbacks.length > 0;
    }
    
    /**
     * 清除特定事件的所有订阅
     * @param event 事件名称
     */
    clearEvent(event: string): void {
        this.listeners.delete(event);
    }
    
    /**
     * 清除所有事件的订阅
     */
    clearAll(): void {
        this.listeners.clear();
    }
} 