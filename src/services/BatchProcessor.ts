import { TFile } from 'obsidian';

// 批处理管理器类，负责处理文件处理队列
export class BatchProcessor {
    private processQueue: Array<TFile> = [];
    private processingBatch: boolean = false;
    private batchSize: number = 50;
    private processFileCallback: (file: TFile) => Promise<void>;
    
    constructor(processFileCallback: (file: TFile) => Promise<void>, batchSize: number = 50) {
        this.processFileCallback = processFileCallback;
        this.batchSize = batchSize;
    }
    
    // 添加文件到处理队列
    public addToProcessQueue(files: TFile[]): void {
        this.processQueue.push(...files);
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
        const batch = this.processQueue.splice(0, this.batchSize);

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => {
                this.processBatchItems(batch);
            });
        } else {
            await this.processBatchItems(batch);
        }
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