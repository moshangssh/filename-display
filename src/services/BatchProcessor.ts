import { TFile } from 'obsidian';
import { ITimerService } from './interfaces/IServices';

// 文件队列项结构
interface QueueItem {
    file: TFile;
    priority: boolean; // true 为高优先级，false 为普通优先级
}

// 批处理管理器类，负责处理文件处理队列
export class BatchProcessor {
    private processQueue: Array<QueueItem> = [];
    private processingBatch = false;
    private batchSize = 50;
    private processFileCallback: (file: TFile) => Promise<void>;
    private timerService: ITimerService;
    
    constructor(
        processFileCallback: (file: TFile) => Promise<void>, 
        timerService: ITimerService,
        batchSize = 50
    ) {
        this.processFileCallback = processFileCallback;
        this.timerService = timerService;
        this.batchSize = batchSize;
    }
    
    // 添加文件到处理队列
    public addToProcessQueue(files: TFile[], highPriority: boolean = false): void {
        // 将文件包装为队列项并添加到队列
        const queueItems = files.map(file => ({ file, priority: highPriority }));
        this.processQueue.push(...queueItems);
        
        if (!this.processingBatch) {
            this.processBatch();
        }
    }
    
    // 处理批次
    private async processBatch(): Promise<void> {
        if (this.processQueue.length === 0) {
            this.processingBatch = false;
            return;
        }

        this.processingBatch = true;
        
        // 对队列进行排序，高优先级的项目排在前面
        this.processQueue.sort((a, b) => {
            if (a.priority === b.priority) return 0;
            return a.priority ? -1 : 1; // 高优先级在前
        });
        
        // 取出前 batchSize 个项目处理
        const batchItems = this.processQueue.splice(0, this.batchSize);
        const batch = batchItems.map(item => item.file);

        // 使用TimerService的requestIdleCallback
        this.timerService.requestIdleCallback(() => {
            this.processBatchItems(batch);
        });
    }
    
    // 处理批次中的项目
    private async processBatchItems(files: TFile[]): Promise<void> {
        for (const file of files) {
            await this.processFileCallback(file);
        }
        
        if (this.processQueue.length > 0) {
            this.processBatch();
        } else {
            this.processingBatch = false;
        }
    }
} 