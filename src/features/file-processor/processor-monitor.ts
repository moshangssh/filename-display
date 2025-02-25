import { FileProcessingStats, ProcessingResult } from '../../types/interfaces';

export class ProcessorMonitor {
    private stats: FileProcessingStats = {
        totalProcessed: 0,
        totalSkipped: 0,
        averageProcessingTime: 0,
        lastProcessingTime: 0,
        errors: []
    };

    private processingTimes: number[] = [];
    private readonly MAX_ERROR_HISTORY = 50;
    private readonly MAX_TIME_HISTORY = 100;

    recordProcessingResult(result: ProcessingResult): void {
        this.stats.totalProcessed += result.processedCount;
        this.stats.totalSkipped += result.skippedCount;
        this.stats.lastProcessingTime = result.duration;

        this.processingTimes.push(result.duration);
        if (this.processingTimes.length > this.MAX_TIME_HISTORY) {
            this.processingTimes.shift();
        }

        this.stats.averageProcessingTime = this.calculateAverageTime();

        if (!result.success && result.error) {
            this.stats.errors.push(result.error);
            if (this.stats.errors.length > this.MAX_ERROR_HISTORY) {
                this.stats.errors.shift();
            }
        }
    }

    getStats(): FileProcessingStats {
        return { ...this.stats };
    }

    private calculateAverageTime(): number {
        if (this.processingTimes.length === 0) return 0;
        const sum = this.processingTimes.reduce((a, b) => a + b, 0);
        return sum / this.processingTimes.length;
    }

    reset(): void {
        this.stats = {
            totalProcessed: 0,
            totalSkipped: 0,
            averageProcessingTime: 0,
            lastProcessingTime: 0,
            errors: []
        };
        this.processingTimes = [];
    }
} 