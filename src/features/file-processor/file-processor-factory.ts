import { FileProcessor, MyPluginSettings, FileProcessorConfig } from '../../types/interfaces';
import { FileProcessorManager } from './index';
import { FileCrawler, CrawlOptions } from './file-crawler';
import { ProcessorMonitor } from './processor-monitor';

export class FileProcessorFactory {
    private static readonly DEFAULT_CONFIG: FileProcessorConfig = {
        maxBatchSize: 1000,
        processingDelay: 0,
        retryAttempts: 3,
        retryDelay: 1000
    };

    static createProcessor(
        settings: MyPluginSettings,
        config: Partial<FileProcessorConfig> = {}
    ): FileProcessor {
        const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
        const monitor = new ProcessorMonitor();
        return new FileProcessorManager(settings, fullConfig, monitor);
    }

    static createCrawler(
        settings: MyPluginSettings,
        options: Partial<CrawlOptions> = {}
    ): FileCrawler {
        return new FileCrawler(settings, options);
    }
} 