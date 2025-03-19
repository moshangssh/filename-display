import { ILoggerService } from '../services/interfaces/IServices';

/**
 * 队列中的事件项
 */
interface QueuedEvent<T, D = unknown> {
    eventType: T;
    data: D;
    timestamp: number;
    priority: number;
}

/**
 * 事件处理器函数类型
 */
export type EventHandler<D = unknown> = (data: D) => Promise<void> | void;

/**
 * 事件总线选项
 */
export interface EventBusOptions {
    /**
     * 批处理大小，每次处理的最大事件数
     */
    batchSize?: number;
    
    /**
     * 批处理延迟，每批之间的等待时间（毫秒）
     */
    batchDelay?: number;
    
    /**
     * 最大队列大小，超过后旧事件将被丢弃
     */
    maxQueueSize?: number;
    
    /**
     * 事件重复过滤时间（毫秒），在此时间内的相同事件被视为重复
     */
    duplicateFilterMs?: number;
    
    /**
     * 日志服务
     */
    loggerService?: ILoggerService;
}

/**
 * 通用事件总线系统，支持事件订阅、发布、队列管理等功能
 */
export class EventBus<T extends string = string> {
    private eventHandlers: Map<T, Set<EventHandler>> = new Map();
    private queuedEvents: Map<T, QueuedEvent<T>[]> = new Map();
    private processing: boolean = false;
    private logger: ILoggerService | null;
    private lastProcessedTime: Map<string, number> = new Map();
    private eventCounter: Map<string, number> = new Map();
    
    // 配置参数
    private batchSize: number;
    private batchDelay: number;
    private maxQueueSize: number;
    private duplicateFilterMs: number;
    
    /**
     * 创建事件总线实例
     * 
     * @param options 事件总线选项
     */
    constructor(options: EventBusOptions = {}) {
        this.batchSize = options.batchSize || 5;
        this.batchDelay = options.batchDelay || 100;
        this.maxQueueSize = options.maxQueueSize || 100;
        this.duplicateFilterMs = options.duplicateFilterMs || 500;
        
        if (options.loggerService) {
            this.logger = options.loggerService.getLogger('EventBus');
        } else {
            this.logger = null;
        }
    }
    
    /**
     * 注册事件处理器
     * 
     * @param eventType 事件类型
     * @param handler 事件处理函数
     * @returns 取消订阅函数
     */
    public on<D = unknown>(eventType: T, handler: EventHandler<D>): () => void {
        this.log('debug', `订阅事件：${eventType}`);
        
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, new Set());
        }
        
        this.eventHandlers.get(eventType)!.add(handler as EventHandler);
        
        // 返回取消订阅函数
        return () => {
            this.off(eventType, handler as EventHandler);
        };
    }
    
    /**
     * 取消注册事件处理器
     * 
     * @param eventType 事件类型
     * @param handler 要取消的事件处理函数
     */
    public off<D = unknown>(eventType: T, handler: EventHandler<D>): void {
        if (this.eventHandlers.has(eventType)) {
            this.eventHandlers.get(eventType)!.delete(handler as EventHandler);
            this.log('debug', `取消订阅事件：${eventType}`);
        }
    }
    
    /**
     * 发送事件
     * 
     * @param eventType 事件类型
     * @param data 事件数据
     * @param priority 事件优先级（数字越大优先级越高）
     */
    public emit<D = unknown>(eventType: T, data?: D, priority: number = 1): void {
        const eventKey = this.getEventKey(eventType, data);
        
        // 检查是否是重复事件
        if (this.isDuplicateEvent(eventKey)) {
            this.log('debug', `跳过重复事件: ${eventType}`);
            return;
        }
        
        const queuedEvent: QueuedEvent<T, D> = {
            eventType,
            data: data as D,
            timestamp: Date.now(),
            priority
        };
        
        if (!this.queuedEvents.has(eventType)) {
            this.queuedEvents.set(eventType, []);
        }
        
        const queue = this.queuedEvents.get(eventType)!;
        
        // 如果队列已满，移除最低优先级的事件
        if (queue.length >= this.maxQueueSize) {
            queue.sort((a, b) => a.priority - b.priority);
            queue.shift(); // 移除最低优先级的事件
            this.log('warn', `事件队列已满，移除低优先级事件: ${eventType}`);
        }
        
        queue.push(queuedEvent);
        this.updateEventCounter(eventKey);
        
        // 开始处理队列
        this.processQueue();
    }
    
    /**
     * 处理事件队列
     */
    private async processQueue(): Promise<void> {
        if (this.processing) return;
        
        this.processing = true;
        
        try {
            // 处理所有事件类型的队列
            for (const [eventType, queue] of this.queuedEvents.entries()) {
                if (queue.length === 0) continue;
                
                const handlers = this.eventHandlers.get(eventType);
                if (!handlers || handlers.size === 0) {
                    // 没有处理器，清空队列
                    this.log('debug', `没有处理器处理事件: ${eventType}，清空队列`);
                    queue.length = 0;
                    continue;
                }
                
                // 按优先级排序
                queue.sort((a, b) => b.priority - a.priority);
                
                // 取出一批事件处理
                const batch = queue.splice(0, this.batchSize);
                
                for (const queuedEvent of batch) {
                    const eventKey = this.getEventKey(queuedEvent.eventType, queuedEvent.data);
                    this.lastProcessedTime.set(eventKey, Date.now());
                    
                    this.log('debug', `处理事件: ${queuedEvent.eventType}`);
                    
                    // 并行执行所有处理器，但捕获潜在错误
                    const results = await Promise.allSettled(
                        Array.from(handlers).map(async (handler) => {
                            try {
                                const result = handler(queuedEvent.data);
                                if (result instanceof Promise) {
                                    return await result;
                                }
                                return result;
                            } catch (error) {
                                this.log('error', `处理事件 ${queuedEvent.eventType} 时出错:`, error);
                                throw error;
                            }
                        })
                    );
                    
                    // 检查结果，记录失败的处理程序
                    const failedPromises = results.filter((result): result is PromiseRejectedResult => 
                        result.status === 'rejected'
                    );
                    
                    if (failedPromises.length > 0) {
                        this.log('warn',
                            `事件 ${queuedEvent.eventType} 的 ${failedPromises.length}/${results.length} 个处理程序失败执行`
                        );
                    }
                }
                
                // 如果队列还有事件，等待一段时间再处理下一批
                if (queue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, this.batchDelay));
                }
            }
        } catch (error) {
            this.log('error', '处理事件队列时出错:', error);
        } finally {
            this.processing = false;
            
            // 如果队列中还有事件，继续处理
            if (this.hasQueuedEvents()) {
                setTimeout(() => this.processQueue(), 0);
            }
        }
    }
    
    /**
     * 检查是否有待处理的事件
     */
    private hasQueuedEvents(): boolean {
        for (const [_, queue] of this.queuedEvents.entries()) {
            if (queue.length > 0) return true;
        }
        return false;
    }
    
    /**
     * 获取事件的唯一键
     */
    private getEventKey(eventType: T, data: unknown): string {
        let dataKey = '';
        
        if (data) {
            // 使用类型检查和类型断言
            if (typeof data === 'object' && data !== null) {
                const objData = data as Record<string, unknown>;
                
                // 如果数据有path属性，将其纳入key
                if ('path' in objData && (typeof objData.path === 'string' || typeof objData.path === 'number')) {
                    dataKey = `-${objData.path}`;
                }
                // 如果数据有id属性，将其纳入key
                else if ('id' in objData && (typeof objData.id === 'string' || typeof objData.id === 'number')) {
                    dataKey = `-${objData.id}`;
                }
            }
            // 如果数据是字符串或数字，直接使用
            else if (typeof data === 'string' || typeof data === 'number') {
                dataKey = `-${data}`;
            }
        }
        
        return `${eventType}${dataKey}`;
    }
    
    /**
     * 更新事件计数器
     */
    private updateEventCounter(eventKey: string): void {
        const count = (this.eventCounter.get(eventKey) || 0) + 1;
        this.eventCounter.set(eventKey, count);
    }
    
    /**
     * 判断是否是重复事件
     */
    private isDuplicateEvent(eventKey: string): boolean {
        const lastProcessed = this.lastProcessedTime.get(eventKey) || 0;
        const now = Date.now();
        
        // 如果相同事件在短时间内重复出现，认为是重复事件
        return (now - lastProcessed) < this.duplicateFilterMs;
    }
    
    /**
     * 记录日志
     */
    private log(level: 'debug' | 'log' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
        if (!this.logger) return;
        
        switch (level) {
            case 'debug':
                this.logger.debug(message, ...args);
                break;
            case 'log':
                this.logger.log(message, ...args);
                break;
            case 'info':
                this.logger.info(message, ...args);
                break;
            case 'warn':
                this.logger.warn(message, ...args);
                break;
            case 'error':
                this.logger.error(message, ...args);
                break;
        }
    }
    
    /**
     * 清理所有事件和处理器
     */
    public clear(): void {
        this.queuedEvents.clear();
        this.eventCounter.clear();
        this.lastProcessedTime.clear();
        this.processing = false;
        this.log('debug', '事件总线已清理');
    }
    
    /**
     * 清理所有事件处理器但保留队列
     */
    public clearHandlers(): void {
        this.eventHandlers.clear();
        this.log('debug', '所有事件处理器已清理');
    }
    
    /**
     * 获取特定事件类型的处理器数量
     */
    public getHandlerCount(eventType: T): number {
        return this.eventHandlers.get(eventType)?.size || 0;
    }
    
    /**
     * 获取所有已注册的事件类型
     */
    public getRegisteredEventTypes(): T[] {
        return Array.from(this.eventHandlers.keys());
    }
} 