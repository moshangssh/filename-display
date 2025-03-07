import { TFile, TFolder } from 'obsidian';

export interface MyPluginSettings {
    activeFolder: string;
    enablePlugin: boolean;
    fileNamePattern: string;
    captureGroup: number;
    maxCacheSize: number;
    batchSize: number;
    showOriginalNameOnHover: boolean;
}

export interface FileCacheItem {
    files: TFile[];
    timestamp: number;
}

export interface CacheStats {
    totalSize: number;
    itemCount: number;
    lastCleanup: number;
}

export interface FileProcessor {
    getUpdatedFileName(originalName: string): string | null;
    findOriginalFileName(displayName: string): string | null;
    processFiles(files: TFile[]): Map<string, string>;
}

export interface CacheManager {
    addToCache(path: string, files: TFile[]): void;
    getFromCache(path: string): FileCacheItem | undefined;
    clearCache(path?: string): void;
    getCacheStats(): CacheStats;
}

export interface StyleManager {
    updateStyles(files: TFile[]): void;
    clearStyles(): void;
}

