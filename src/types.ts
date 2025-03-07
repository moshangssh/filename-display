import { Plugin } from 'obsidian';

export interface FilenameDisplaySettings {
    pattern: string;
}

export interface IFilenameDisplayPlugin extends Plugin {
    settings: FilenameDisplaySettings;
    saveSettings(): Promise<void>;
    updateAllFilesDisplay(): void;
}

export interface FileDisplayResult {
    success: boolean;
    error?: string;
    displayName?: string;
} 