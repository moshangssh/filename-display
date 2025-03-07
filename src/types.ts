import { Plugin } from 'obsidian';

export interface FilenameDisplaySettings {
    pattern: string;
    useYamlTitleWhenAvailable: boolean;
    preferFrontmatterTitle: boolean;
    enabledFolders: string[];
}

export interface IFilenameDisplayPlugin extends Plugin {
    settings: FilenameDisplaySettings;
    saveSettings(): Promise<void>;
    updateAllFilesDisplay(): void;
}

export interface FileDisplayResult {
    success: boolean;
    displayName: string;
    error?: string;
    fromCache?: boolean;
}

export interface FileCacheWithFrontmatter {
    frontmatter?: {
        [key: string]: any;
        title?: string;
    };
} 