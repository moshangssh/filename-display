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
                return this.getFallbackName(nameWithoutExt);
            }

            const regex = new RegExp(this.settings.fileNamePattern);
            const match = nameWithoutExt.match(regex);
            
            if (match && ValidationHelper.isValidCaptureGroup(this.settings.fileNamePattern, this.settings.captureGroup)) {
                const result = match[this.settings.captureGroup];
                if (result) {
                    const displayName = result.trim();
                    this.updateNameMapping(nameWithoutExt, displayName);
                    return displayName;
                }
            }
            
            return this.getFallbackName(nameWithoutExt);
        } catch (error) {
            console.error('文件名处理错误:', error);
            return this.getFallbackName(originalName);
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