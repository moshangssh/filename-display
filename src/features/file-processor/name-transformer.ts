import { ValidationHelper } from '../../utils/validation';
import { MyPluginSettings } from '../../types/interfaces';

export class NameTransformer {
    constructor(private settings: MyPluginSettings) {}

    transform(originalName: string): string | null {
        try {
            const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
            
            if (!ValidationHelper.isValidRegex(this.settings.fileNamePattern)) {
                return this.getFallbackName(nameWithoutExt);
            }

            const regex = new RegExp(this.settings.fileNamePattern);
            const match = nameWithoutExt.match(regex);
            
            if (match && ValidationHelper.isValidCaptureGroup(this.settings.fileNamePattern, this.settings.captureGroup)) {
                const result = match[this.settings.captureGroup];
                return result?.trim() || this.getFallbackName(nameWithoutExt);
            }
            
            return this.getFallbackName(nameWithoutExt);
        } catch (error) {
            console.error('名称转换错误:', error);
            return this.getFallbackName(originalName);
        }
    }

    private getFallbackName(originalName: string): string {
        const MAX_LENGTH = 30;
        if (originalName.length > MAX_LENGTH) {
            return originalName.substring(0, MAX_LENGTH - 3) + '...';
        }
        return originalName;
    }
}
