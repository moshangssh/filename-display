import { TFile } from 'obsidian';
import { FileProcessor, MyPluginSettings, FileProcessorConfig } from '../../types/interfaces';
import { NameTransformer } from './name-transformer';
import { ProcessorMonitor } from './processor-monitor';

export class FileProcessorManager implements FileProcessor {
    private nameMapping: Map<string, string> = new Map();
    private nameTransformer: NameTransformer;

    constructor(
        private settings: MyPluginSettings,
        private config: FileProcessorConfig,
        private monitor: ProcessorMonitor
    ) {
        this.nameTransformer = new NameTransformer(settings);
    }

    getUpdatedFileName(originalName: string): string | null {
        const newName = this.nameTransformer.transform(originalName);
        if (newName) {
            this.updateNameMapping(originalName, newName);
        }
        return newName;
    }

    findOriginalFileName(displayName: string): string | null {
        return this.nameMapping.get(displayName) || null;
    }

    private updateNameMapping(originalName: string, displayName: string): void {
        this.nameMapping.set(displayName, originalName);
        this.nameMapping.set(originalName, originalName);
    }

    clearNameMapping(): void {
        this.nameMapping.clear();
    }

    processFiles(files: TFile[]): Map<string, string> {
        const processedNames = new Map<string, string>();
        
        for (const file of files) {
            const newName = this.getUpdatedFileName(file.basename);
            if (newName) {
                processedNames.set(file.path, newName);
            }
        }
        
        return processedNames;
    }
}
