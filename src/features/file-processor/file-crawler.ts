import { TFile, TFolder } from 'obsidian';
import { MyPluginSettings } from '../../types/interfaces';

export interface CrawlOptions {
    maxDepth: number;
    excludeFolders: string[];
    fileExtensions: string[];
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
            fileExtensions: ['.md'],
            ...options
        };
    }

    async getAllFiles(folder: TFolder): Promise<TFile[]> {
        const files: TFile[] = [];
        await this.processFilesInBatches(folder, files, 0);
        return files;
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
        if (!this.options.fileExtensions?.length) {
            return true;
        }
        return this.options.fileExtensions.some(ext => 
            file.extension.toLowerCase() === ext.toLowerCase().replace('.', '')
        );
    }
}

