import { TAbstractFile } from 'obsidian';

/**
 * 事件类型枚举
 */
export enum FileEventType {
    CREATE = 'create',
    MODIFY = 'modify',
    DELETE = 'delete',
    RENAME = 'rename'
}

/**
 * 文件事件接口
 */
export interface FileEvent {
    type: FileEventType;
    file: TAbstractFile;
    oldPath?: string;
}

/**
 * 事件总线配置
 */
export interface EventBusConfig {
    throttleTimeMs: number;
    debounceTimeMs: number;
}

type EventCallback = (event: FileEvent) => void;

/**
 * 防抖函数
 */
function debounce(fn: Function, delay: number): Function {
    let timer: NodeJS.Timeout | null = null;
    return function(...args: any[]) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            fn.apply(this, args);
            timer = null;
        }, delay);
    };
}

/**
 * 节流函数
 */
function throttle(fn: Function, delay: number): Function {
    let lastTime = 0;
    return function(...args: any[]) {
        const now = Date.now();
        if (now - lastTime >= delay) {
            fn.apply(this, args);
            lastTime = now;
        }
    };
}

/**
 * 事件总线类
 */
export class EventBus {
    private listeners: Map<FileEventType, Set<EventCallback>> = new Map();
    private config: EventBusConfig;
    
    constructor(config: EventBusConfig = {
        throttleTimeMs: 300,
        debounceTimeMs: 500
    }) {
        this.config = config;
        
        // 初始化事件类型映射
        Object.values(FileEventType).forEach(type => {
            this.listeners.set(type as FileEventType, new Set());
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
            wrappedCallback = debounce(callback, this.config.debounceTimeMs) as EventCallback;
        }
        
        listeners.add(wrappedCallback);
        
        // 返回取消订阅函数
        return () => {
            listeners.delete(wrappedCallback);
        };
    }
    
    /**
     * 发送事件
     */
    public emit(event: FileEvent): void {
        const listeners = this.listeners.get(event.type);
        if (!listeners) return;
        
        listeners.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error(`事件处理错误 [${event.type}]:`, error);
            }
        });
    }
    
    /**
     * 获取特定文件夹的事件监听器
     */
    public getFolderListener(folderPath: string, callback: EventCallback): () => void {
        const wrappedCallback = (event: FileEvent) => {
            if (event.file.path.startsWith(folderPath)) {
                callback(event);
            }
        };
        
        // 为所有事件类型注册监听器
        const unsubscribes = Object.values(FileEventType).map(type => 
            this.on(type as FileEventType, wrappedCallback)
        );
        
        // 返回组合的取消订阅函数
        return () => unsubscribes.forEach(unsubscribe => unsubscribe());
    }
    
    /**
     * 获取特定文件类型的事件监听器
     */
    public getFileTypeListener(extension: string, callback: EventCallback): () => void {
        const wrappedCallback = (event: FileEvent) => {
            if (event.file.path.endsWith(`.${extension}`)) {
                callback(event);
            }
        };
        
        // 为所有事件类型注册监听器
        const unsubscribes = Object.values(FileEventType).map(type => 
            this.on(type as FileEventType, wrappedCallback)
        );
        
        // 返回组合的取消订阅函数
        return () => unsubscribes.forEach(unsubscribe => unsubscribe());
    }
    
    /**
     * 更新配置
     */
    public updateConfig(config: Partial<EventBusConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 清理所有监听器
     */
    public destroy(): void {
        this.listeners.clear();
    }
} 