import { TFile } from 'obsidian';
import { FileEvent, FileEventType } from './EventManagerService';
import { ILoggerService } from './interfaces/IServices';

interface QueuedEvent {
    event: FileEvent;
    timestamp: number;
    priority: number;
}

export class EventQueueManager {
    private queue: QueuedEvent[] = [];
    private isProcessing: boolean = false;
    private batchSize: number = 5;
    private batchDelay: number = 100; // ms
    private logger: ILoggerService;
    private maxQueueSize: number = 100;
    private eventCounter: Map<string, number> = new Map();
    private lastProcessedTime: Map<string, number> = new Map();

    constructor(loggerService: ILoggerService) {
        this.logger = loggerService.getLogger('EventQueueManager');
    }

    public enqueue(event: FileEvent): void {
        const priority = this.calculatePriority(event);
        const queuedEvent: QueuedEvent = {
            event,
            timestamp: Date.now(),
            priority
        };

        // 检查是否是重复事件
        if (this.isDuplicateEvent(event)) {
            this.logger.debug(`跳过重复事件: ${event.type} - ${event.file?.path}`);
            return;
        }

        // 如果队列已满，移除最低优先级的事件
        if (this.queue.length >= this.maxQueueSize) {
            this.queue.sort((a, b) => a.priority - b.priority);
            this.queue.shift(); // 移除最低优先级的事件
        }

        this.queue.push(queuedEvent);
        this.updateEventCounter(event);

        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    private isDuplicateEvent(event: FileEvent): boolean {
        const key = this.getEventKey(event);
        const lastProcessed = this.lastProcessedTime.get(key) || 0;
        const now = Date.now();
        
        // 如果相同事件在短时间内（500ms）重复出现，认为是重复事件
        return (now - lastProcessed) < 500;
    }

    private getEventKey(event: FileEvent): string {
        return `${event.type}-${event.file?.path || 'no-file'}`;
    }

    private updateEventCounter(event: FileEvent): void {
        const key = this.getEventKey(event);
        const count = (this.eventCounter.get(key) || 0) + 1;
        this.eventCounter.set(key, count);
    }

    private calculatePriority(event: FileEvent): number {
        let priority = 1;

        // 文件创建和删除事件优先级最高
        if (event.type === FileEventType.CREATE || event.type === FileEventType.DELETE) {
            priority += 3;
        }
        // 重命名事件次之
        else if (event.type === FileEventType.RENAME) {
            priority += 2;
        }
        // 修改事件优先级最低
        else if (event.type === FileEventType.MODIFY) {
            priority += 1;
        }

        // 考虑事件频率，频繁发生的事件优先级降低
        const key = this.getEventKey(event);
        const frequency = this.eventCounter.get(key) || 0;
        priority -= Math.min(frequency * 0.1, 1); // 最多降低1点优先级

        return priority;
    }

    private async processQueue(): Promise<void> {
        if (this.queue.length === 0 || this.isProcessing) {
            return;
        }

        this.isProcessing = true;

        try {
            while (this.queue.length > 0) {
                // 按优先级排序
                this.queue.sort((a, b) => b.priority - a.priority);

                // 获取一批要处理的事件
                const batch = this.queue.splice(0, this.batchSize);

                // 处理这批事件
                for (const queuedEvent of batch) {
                    const key = this.getEventKey(queuedEvent.event);
                    this.lastProcessedTime.set(key, Date.now());
                    
                    try {
                        await this.processEvent(queuedEvent.event);
                    } catch (error) {
                        this.logger.error(`处理事件失败: ${queuedEvent.event.type}`, error);
                    }
                }

                // 如果队列还有事件，等待一段时间再处理下一批
                if (this.queue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, this.batchDelay));
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private async processEvent(event: FileEvent): Promise<void> {
        // 这个方法将由EventManagerService实现
        // 在这里我们只记录事件处理
        this.logger.debug(`处理事件: ${event.type} - ${event.file?.path}`);
    }

    public setEventProcessor(processor: (event: FileEvent) => Promise<void>): void {
        this.processEvent = processor;
    }

    public clear(): void {
        this.queue = [];
        this.eventCounter.clear();
        this.lastProcessedTime.clear();
        this.isProcessing = false;
    }
} 