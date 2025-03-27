import { TFile } from 'obsidian';
import { ILoggerService } from './interfaces/IServices';

/**
 * 更新项目接口
 */
interface UpdateItem {
    file: TFile;
    element: HTMLElement;
    oldValue: string;
    newValue: string;
    timestamp: number;
}

/**
 * 更新批次接口
 */
interface UpdateBatch {
    items: UpdateItem[];
    timestamp: number;
    processed: boolean;
}

/**
 * 增量更新管理器配置
 */
interface IncrementalUpdateConfig {
    batchSize: number;         // 每批处理的最大项目数
    batchDelay: number;        // 批次间的延迟时间（毫秒）
    maxQueueSize: number;      // 最大队列长度
    updateInterval: number;    // 更新检查间隔（毫秒）
}

/**
 * 增量更新管理器
 * 
 * 负责管理DOM元素的增量更新，优化大量更新时的性能。
 * 
 * 主要功能：
 * 1. 批量处理更新
 * 2. 智能合并更新
 * 3. 优化更新顺序
 * 4. 防止重复更新
 */
export class IncrementalUpdateManager {
    private updateQueue: UpdateBatch[] = [];
    private processingBatch: boolean = false;
    private updateTimer: NodeJS.Timeout | null = null;
    private pendingUpdates: Map<string, UpdateItem> = new Map();
    
    // 默认配置
    private readonly defaultConfig: IncrementalUpdateConfig = {
        batchSize: 50,         // 每批最多50个项目
        batchDelay: 16,        // 16ms延迟（约一帧）
        maxQueueSize: 1000,    // 最多1000个项目
        updateInterval: 100    // 100ms检查一次更新
    };

    constructor(
        private config: Partial<IncrementalUpdateConfig>,
        private logger: ILoggerService,
        private updateCallback: (items: UpdateItem[]) => Promise<void>
    ) {
        this.config = { ...this.defaultConfig, ...config };
        this.startUpdateTimer();
    }

    /**
     * 添加更新项
     */
    public queueUpdate(
        file: TFile,
        element: HTMLElement,
        oldValue: string,
        newValue: string
    ): void {
        const key = `${file.path}:${element.getAttribute('data-path')}`;
        
        // 创建或更新待处理项
        this.pendingUpdates.set(key, {
            file,
            element,
            oldValue,
            newValue,
            timestamp: Date.now()
        });

        // 如果待处理项达到批量大小，立即创建新批次
        if (this.pendingUpdates.size >= (this.config.batchSize || this.defaultConfig.batchSize)) {
            this.createNewBatch();
        }
    }

    /**
     * 创建新的更新批次
     */
    private createNewBatch(): void {
        if (this.pendingUpdates.size === 0) return;

        // 收集所有待处理项
        const items = Array.from(this.pendingUpdates.values());
        this.pendingUpdates.clear();

        // 创建新批次
        const batch: UpdateBatch = {
            items,
            timestamp: Date.now(),
            processed: false
        };

        // 添加到队列
        this.updateQueue.push(batch);

        // 如果队列过长，移除最旧的批次
        while (this.updateQueue.length > (this.config.maxQueueSize || this.defaultConfig.maxQueueSize)) {
            const oldestBatch = this.updateQueue.shift();
            if (oldestBatch) {
                this.logger.warn(`丢弃过期批次，包含 ${oldestBatch.items.length} 个更新项`);
            }
        }

        // 如果没有正在处理的批次，开始处理
        if (!this.processingBatch) {
            this.processNextBatch();
        }
    }

    /**
     * 处理下一个批次
     */
    private async processNextBatch(): Promise<void> {
        if (this.processingBatch || this.updateQueue.length === 0) return;

        this.processingBatch = true;
        const batch = this.updateQueue[0];

        try {
            // 处理当前批次
            await this.updateCallback(batch.items);
            
            // 标记为已处理
            batch.processed = true;
            
            // 从队列中移除
            this.updateQueue.shift();
            
            this.logger.debug(`成功处理批次，包含 ${batch.items.length} 个更新项`);
        } catch (error) {
            this.logger.error('处理更新批次时出错:', error);
        } finally {
            this.processingBatch = false;
        }

        // 延迟处理下一个批次
        const delay = this.config.batchDelay || this.defaultConfig.batchDelay;
        setTimeout(() => {
            this.processNextBatch();
        }, delay);
    }

    /**
     * 启动更新定时器
     */
    private startUpdateTimer(): void {
        const interval = this.config.updateInterval || this.defaultConfig.updateInterval;
        
        this.updateTimer = setInterval(() => {
            if (this.pendingUpdates.size > 0) {
                this.createNewBatch();
            }
        }, interval);
    }

    /**
     * 获取当前队列状态
     */
    public getStatus(): {
        queueLength: number;
        pendingUpdates: number;
        processing: boolean;
    } {
        return {
            queueLength: this.updateQueue.length,
            pendingUpdates: this.pendingUpdates.size,
            processing: this.processingBatch
        };
    }

    /**
     * 清空所有待处理的更新
     */
    public clear(): void {
        this.updateQueue = [];
        this.pendingUpdates.clear();
        this.processingBatch = false;
    }

    /**
     * 销毁管理器
     */
    public dispose(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
        this.clear();
    }
} 