// src/services/cache/interfaces/IFileDisplayCache.ts
import { FileDisplayResult } from '../../../types';
import { CacheCleanStrategy } from '../../interfaces/IServices';

export interface IFileDisplayCache {
    // 核心缓存接口方法
    get(path: string): FileDisplayResult | undefined;
    set(path: string, result: FileDisplayResult): void;
    deletePath(path: string): void;
    clear(): void;
    clearAll(): void;
    
    // 文件显示名称相关方法
    getDisplayName(path: string): string | undefined;
    setDisplayName(path: string, displayName: string): void;
    hasDisplayName(path: string): boolean;
    setDisplayNames(entries: Array<[string, string]>): void;
    
    // 原始文件名相关方法
    saveOriginalName(path: string, originalName: string): void;
    getOriginalName(path: string): string | undefined;
    getAllOriginalNames(): Map<string, string>;
    
    // 元素关联方法
    saveElementData(element: HTMLElement, path: string, originalName: string): void;
    getElementData(element: HTMLElement): { path: string; originalName: string } | undefined;
    
    // 缓存管理方法
    isCacheValid(path: string): boolean;
    isProcessed(path: string): boolean;
    updateFileMTime(path: string): void;
    clearExpired(): void;
    
    // 文件链接关系方法
    addFileLink(sourcePath: string, targetPath: string): void;
    getFileLinks(path: string): Set<string>;
    preloadLinkedFiles(path: string): void;
    
    // 缓存预热方法
    warmUpCache(): Promise<void>;
    cancelWarmupCache(): void;
    isCacheWarmedUp(): boolean;
    getWarmupProgress(): number;
    isWarmingUp(): boolean;
    
    // 缓存策略相关方法
    setCacheCleanStrategy(strategy: CacheCleanStrategy): void;
    getCacheCleanStrategy(): CacheCleanStrategy;
    triggerCleanup(): void;
    stopPeriodicCleanup(): void;
    
    // 资源管理
    dispose(): void;
} 