import { Plugin } from 'obsidian';
import { Extension } from '@codemirror/state';

export interface FilenameDisplaySettings {
    pattern: string;
    useYamlTitleWhenAvailable: boolean;
    preferFrontmatterTitle: boolean;
    enabledFolders: string[];
    enableEditorLinkDecorations: boolean;
}

export interface IFilenameDisplayPlugin extends Plugin {
    settings: FilenameDisplaySettings;
    saveSettings(): Promise<void>;
    updateAllFilesDisplay(): void;
    registerEditorExtension(extension: Extension[]): void;
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