import { TFile } from 'obsidian';
import { FileProcessor, MyPluginSettings } from '../../types/interfaces';
import { ValidationHelper } from '../../utils/validation';

export class DefaultFileProcessor implements FileProcessor {
    private nameMapping: Map<string, string> = new Map();

    constructor(private settings: MyPluginSettings) {}

    getUpdatedFileName(originalName: string): string | null {
        try {
            const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
            
            if (!ValidationHelper.isValidRegex(this.settings.fileNamePattern)) {
                return null;
            }

            const regex = new RegExp(this.settings.fileNamePattern);
            const match = nameWithoutExt.match(regex);
            
            if (match && match[this.settings.captureGroup]) {
                const displayName = match[this.settings.captureGroup].trim();
                this.updateNameMapping(nameWithoutExt, displayName);
                return displayName;
            }
            
            return null;
        } catch (error) {
            console.error("处理文件名失败:", error);
            return null;
        }
    }

    findOriginalFileName(displayName: string): string | null {
        return this.nameMapping.get(displayName) || null;
    }

    private getFallbackName(originalName: string): string {
        const MAX_LENGTH = 30;
        if (originalName.length > MAX_LENGTH) {
            return originalName.substring(0, MAX_LENGTH - 3) + '...';
        }
        return originalName;
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