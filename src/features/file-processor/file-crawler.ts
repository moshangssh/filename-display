import { TFile, TFolder } from 'obsidian';
import { MyPluginSettings } from '../../types/interfaces';

export interface CrawlOptions {
    maxDepth: number;
    excludeFolders: string[];
}

export class FileCrawler {
    private readonly options: CrawlOptions;

    constructor(
        private settings: MyPluginSettings,
        options: Partial<CrawlOptions> = {}
    ) {
        this.options = {
            maxDepth: -1,
            excludeFolders: [],
            ...options
        };
    }

    async getAllFiles(folder: TFolder): Promise<TFile[]> {
        const files: TFile[] = [];
        
        // 使用异步处理，避免阻塞UI
        await this.processFilesWithDelay(folder, files, 0);
        
        return files;
    }

    private async processFilesWithDelay(folder: TFolder, files: TFile[], depth: number): Promise<void> {
        if (this.options.maxDepth !== -1 && depth > this.options.maxDepth) {
            return;
        }

        if (this.options.excludeFolders?.includes(folder.path)) {
            return;
        }

        // 先处理当前文件夹中的文件，优先显示
        const currentFiles = folder.children.filter(child => 
            child instanceof TFile && child.extension === 'md'
        ) as TFile[];
        
        if (currentFiles.length > 0) {
            // 小批量添加文件，每批后让出UI线程
            const batchSize = Math.min(50, this.settings.batchSize);
            for (let i = 0; i < currentFiles.length; i += batchSize) {
                const batch = currentFiles.slice(i, i + batchSize);
                files.push(...batch);
                
                // 每批处理后让出UI线程
                if (i + batchSize < currentFiles.length) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                
                // 如果已达到总批处理大小限制，提前返回
                if (files.length >= this.settings.batchSize) {
                    return;
                }
            }
        }
        
        // 然后处理子文件夹
        const subFolders = folder.children.filter(child => 
            child instanceof TFolder
        ) as TFolder[];
        
        for (const subFolder of subFolders) {
            // 每处理一个子文件夹前让出UI线程
            await new Promise(resolve => setTimeout(resolve, 0));
            
            // 如果已达到总批处理大小限制，提前返回
            if (files.length >= this.settings.batchSize) {
                return;
            }
            
            await this.processFilesWithDelay(subFolder, files, depth + 1);
        }
    }

    private async processFilesInBatches(folder: TFolder, files: TFile[], depth: number): Promise<void> {
        if (this.options.maxDepth !== -1 && depth > this.options.maxDepth) {
            return;
        }

        if (this.options.excludeFolders?.includes(folder.path)) {
            return;
        }

        let batch: TFile[] = [];

        const processBatch = async () => {
            if (batch.length > 0) {
                files.push(...batch);
                batch = [];
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        };

        for (const child of folder.children) {
            if (child instanceof TFile) {
                if (this.shouldProcessFile(child)) {
                    batch.push(child);
                    if (batch.length >= this.settings.batchSize) {
                        await processBatch();
                    }
                }
            } else if (child instanceof TFolder) {
                await processBatch();
                await this.processFilesInBatches(child, files, depth + 1);
            }
        }

        await processBatch();
    }

    private shouldProcessFile(file: TFile): boolean {
        return true;
    }
}

