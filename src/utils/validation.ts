import { TFolder } from 'obsidian';

export class ValidationHelper {
    static isValidRegex(pattern: string): boolean {
        try {
            new RegExp(pattern);
            return true;
        } catch {
            return false;
        }
    }

    static isValidFolder(folder: unknown): folder is TFolder {
        return folder instanceof TFolder;
    }

    static isValidCaptureGroup(pattern: string, groupIndex: number): boolean {
        try {
            const regex = new RegExp(pattern);
            const testStr = "test_2024_01_01_title";
            const matches = testStr.match(regex);
            return !!(matches && groupIndex >= 0 && groupIndex < matches.length);
        } catch {
            return false;
        }
    }

    static isValidNumber(value: string, min = 0): boolean {
        const num = parseInt(value);
        return !isNaN(num) && num >= min;
    }
} 