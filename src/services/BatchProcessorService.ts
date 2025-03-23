import { ILoggerService, ITimerService } from './interfaces/IServices';

/**
 * 批量处理队列项
 */
interface BatchQueueItem<T> {
    data: T;                   // 数据项
    priority: number;          // 优先级 (越高越优先)
    timestamp: number;         // 创建时间
    processed: boolean;        // 是否已处理
}

/**
 * 批处理选项
 */
export interface BatchProcessingOptions {
    batchSize: number;                 // 批处理大小
    interval: number;                  // 批处理间隔 (毫秒)
    minBatchSize: number;              // 最小批处理大小
    maxBatchSize: number;              // 最大批处理大小
    targetProcessingTime: number;      // 目标处理时间 (毫秒)
    useDynamicBatchSize: boolean;      // 是否使用动态批处理大小
    useIdleCallback: boolean;          // 是否使用空闲回调
    parallelProcessing: boolean;       // 是否启用并行处理
    maxParallelBatches: number;        // 最大并行批处理数量
}

/**
 * 批处理统计信息
 */
export interface BatchProcessingStats {
    queueSize: number;             // 队列长度
    processedItems: number;        // 已处理项数
    currentBatchSize: number;      // 当前批处理大小
    isProcessing: boolean;         // 是否正在处理
    averageProcessingTime: number; // 平均处理时间
    lastBatchTime: number;         // 上一批处理时间
    peakQueueSize: number;         // 峰值队列长度
    totalProcessingTime: number;   // 总处理时间
}

/**
 * 批处理服务
 * 高效管理和处理大批量数据，支持优先级，动态批处理大小和异步处理
 */
export class BatchProcessorService<T> {
    private queue: BatchQueueItem<T>[] = [];
    private isProcessing = false;
    private processingCount = 0;
    private options: BatchProcessingOptions;
    private processor: (items: T[]) => Promise<void>;
    private logger: ILoggerService;
    private timer: ITimerService;
    private timerIds: number[] = [];
    
    // 统计信息
    private stats = {
        processedItems: 0,
        totalProcessingTime: 0,
        batchesProcessed: 0,
        peakQueueSize: 0,
        lastBatchTime: 0,
        totalItems: 0
    };
    
    // 默认选项
    private readonly defaultOptions: BatchProcessingOptions = {
        batchSize: 20,
        interval: 10,
        minBatchSize: 5,
        maxBatchSize: 100,
        targetProcessingTime: 50,
        useDynamicBatchSize: true,
        useIdleCallback: true,
        parallelProcessing: false,
        maxParallelBatches: 2
    };

    constructor(
        processor: (items: T[]) => Promise<void>,
        logger: ILoggerService,
        timer: ITimerService,
        options?: Partial<BatchProcessingOptions>
    ) {
        this.processor = processor;
        this.logger = logger.getLogger('BatchProcessorService');
        this.timer = timer;
        this.options = { ...this.defaultOptions, ...options };
        this.logger.debug('BatchProcessorService 初始化完成', this.options);
    }

    /**
     * 添加项到处理队列
     * @param items 数据项
     * @param priority 优先级, 越高越优先处理
     */
    public add(items: T[], priority = 0): void {
        const timestamp = Date.now();
        
        // 创建队列项
        const queueItems = items.map(data => ({
            data,
            priority,
            timestamp,
            processed: false
        }));
        
        // 记录统计信息
        this.stats.totalItems += items.length;
        
        // 添加到队列
        this.queue.push(...queueItems);
        
        // 更新峰值队列长度
        if (this.queue.length > this.stats.peakQueueSize) {
            this.stats.peakQueueSize = this.queue.length;
        }
        
        // 如果未在处理，开始处理
        if (!this.isProcessing) {
            this.startProcessing();
        }
    }

    /**
     * 开始批处理
     */
    private startProcessing(): void {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        this.logger.debug(`开始批处理，队列长度: ${this.queue.length}`);
        
        if (this.options.useIdleCallback) {
            const timerId = this.timer.requestIdleCallback(() => this.processNextBatch());
            this.timerIds.push(timerId);
        } else {
            const timerId = this.timer.setTimeout(() => this.processNextBatch(), 0);
            this.timerIds.push(timerId);
        }
    }

    /**
     * 处理下一批数据
     */
    private async processNextBatch(): Promise<void> {
        if (this.queue.length === 0) {
            // 队列为空，停止处理
            this.isProcessing = false;
            this.logger.debug('批处理队列处理完成');
            return;
        }
        
        // 检查是否可以启动新的并行批处理
        if (this.options.parallelProcessing && 
            this.processingCount >= this.options.maxParallelBatches) {
            // 已达到最大并行数，等待其他批处理完成
            return;
        }
        
        // 按优先级排序
        this.queue.sort((a, b) => {
            if (a.priority === b.priority) {
                // 同等优先级，按时间戳排序
                return a.timestamp - b.timestamp;
            }
            return b.priority - a.priority; // 优先级降序
        });
        
        // 确定批处理大小
        const currentBatchSize = Math.min(this.options.batchSize, this.queue.length);
        
        // 获取下一批数据
        const batchItems = this.queue.splice(0, currentBatchSize);
        const batchData = batchItems.map(item => item.data);
        
        this.processingCount++;
        
        try {
            // 处理批次并记录时间
            const startTime = performance.now();
            await this.processor(batchData);
            const endTime = performance.now();
            const processingTime = endTime - startTime;
            
            // 更新统计信息
            this.stats.processedItems += batchData.length;
            this.stats.totalProcessingTime += processingTime;
            this.stats.batchesProcessed++;
            this.stats.lastBatchTime = processingTime;
            
            this.logger.debug(
                `批处理完成: ${batchData.length} 项, ` +
                `耗时: ${processingTime.toFixed(2)}ms, ` +
                `剩余: ${this.queue.length} 项`
            );
            
            // 动态调整批处理大小
            if (this.options.useDynamicBatchSize) {
                this.adjustBatchSize(processingTime, currentBatchSize);
            }
        } catch (error) {
            this.logger.error('批处理出错:', error);
            
            // 发生错误时，重新将未处理的项添加回队列
            const errorPriority = Math.max(0, ...batchItems.map(item => item.priority - 1));
            this.add(batchData, errorPriority);
        } finally {
            this.processingCount--;
            
            // 安排下一批处理
            if (this.queue.length > 0) {
                if (this.options.useIdleCallback) {
                    const timerId = this.timer.requestIdleCallback(() => this.processNextBatch());
                    this.timerIds.push(timerId);
                } else {
                    const timerId = this.timer.setTimeout(
                        () => this.processNextBatch(), 
                        this.options.interval
                    );
                    this.timerIds.push(timerId);
                }
            } else if (this.processingCount === 0) {
                // 所有批次处理完成
                this.isProcessing = false;
                this.logger.debug('所有批处理任务完成');
            }
        }
    }

    /**
     * 动态调整批处理大小以优化性能
     */
    private adjustBatchSize(processingTime: number, currentBatchSize: number): void {
        const targetTime = this.options.targetProcessingTime;
        
        if (processingTime > targetTime * 1.5 && this.options.batchSize > this.options.minBatchSize) {
            // 处理时间过长，减小批处理大小
            const reductionFactor = targetTime / processingTime;
            const newBatchSize = Math.max(
                this.options.minBatchSize,
                Math.floor(this.options.batchSize * reductionFactor)
            );
            
            this.options.batchSize = newBatchSize;
            this.logger.debug(`批处理大小减小: ${newBatchSize} (处理时间: ${processingTime.toFixed(2)}ms)`);
            
        } else if (processingTime < targetTime * 0.5 && this.options.batchSize < this.options.maxBatchSize) {
            // 处理时间很短，增加批处理大小
            const increaseFactor = targetTime / processingTime;
            const newBatchSize = Math.min(
                this.options.maxBatchSize,
                Math.ceil(this.options.batchSize * Math.min(increaseFactor, 1.5))
            );
            
            this.options.batchSize = newBatchSize;
            this.logger.debug(`批处理大小增加: ${newBatchSize} (处理时间: ${processingTime.toFixed(2)}ms)`);
        }
    }

    /**
     * 清空队列
     */
    public clear(): void {
        this.queue = [];
        this.logger.debug('批处理队列已清空');
    }

    /**
     * 暂停处理
     */
    public pause(): void {
        if (!this.isProcessing) return;
        
        // 清除所有定时器
        this.timerIds.forEach(id => {
            this.timer.clearTimeout(id);
            this.timer.cancelIdleCallback(id);
        });
        this.timerIds = [];
        
        this.isProcessing = false;
        this.logger.debug('批处理已暂停');
    }

    /**
     * 恢复处理
     */
    public resume(): void {
        if (this.isProcessing || this.queue.length === 0) return;
        
        this.startProcessing();
        this.logger.debug('批处理已恢复');
    }

    /**
     * 获取队列长度
     */
    public getQueueLength(): number {
        return this.queue.length;
    }

    /**
     * 获取处理统计信息
     */
    public getStats(): BatchProcessingStats {
        const averageProcessingTime = this.stats.batchesProcessed > 0
            ? this.stats.totalProcessingTime / this.stats.batchesProcessed
            : 0;
            
        return {
            queueSize: this.queue.length,
            processedItems: this.stats.processedItems,
            currentBatchSize: this.options.batchSize,
            isProcessing: this.isProcessing,
            averageProcessingTime: averageProcessingTime,
            lastBatchTime: this.stats.lastBatchTime,
            peakQueueSize: this.stats.peakQueueSize,
            totalProcessingTime: this.stats.totalProcessingTime
        };
    }

    /**
     * 更新选项
     */
    public updateOptions(options: Partial<BatchProcessingOptions>): void {
        this.options = { ...this.options, ...options };
        this.logger.debug('批处理选项已更新', this.options);
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        this.pause();
        this.clear();
        this.logger.debug('BatchProcessorService 资源已释放');
    }
} 