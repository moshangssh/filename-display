import { TFile, MarkdownView } from 'obsidian';
import type { IFilenameDisplayPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';
import { BatchProcessor } from './BatchProcessor';

export class FileProcessorService {
    private plugin: IFilenameDisplayPlugin;
    private filenameParser: FilenameParser;
    private fileDisplayCache: FileDisplayCache;
    private batchProcessor: BatchProcessor;
    
    constructor(
        plugin: IFilenameDisplayPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: FileDisplayCache,
        updateFileDisplayFn: (file: TFile) => Promise<void>
    ) {
        this.plugin = plugin;
        this.filenameParser = filenameParser;
        this.fileDisplayCache = fileDisplayCache;
        
        // 初始化批处理器
        this.batchProcessor = new BatchProcessor(
            updateFileDisplayFn,
            50
        );
    }
    
    // 处理单个文件并返回处理结果
    public processFile(file: TFile): FileDisplayResult {
        // 检查文件是否在启用的文件夹中
        if (!this.filenameParser.isFileInEnabledFolder(file)) {
            return {
                success: false,
                error: '文件不在启用的文件夹中',
                displayName: file.basename
            };
        }

        // 检查缓存
        if (this.fileDisplayCache.hasDisplayName(file.path)) {
            const cachedName = this.fileDisplayCache.getDisplayName(file.path);
            if (cachedName) {
                return {
                    success: true,
                    displayName: cachedName,
                    fromCache: true
                };
            }
        }

        // 使用metadataCache获取文件元数据，处理文件名
        const result = this.filenameParser.getDisplayNameFromMetadata(file);
        if (result.success && result.displayName) {
            this.fileDisplayCache.setDisplayName(file.path, result.displayName);
        }
        return result;
    }
    
    // 更新所有文件显示
    public updateAllFilesDisplay(clearCache: boolean = true): void {
        // 根据参数决定是清除所有缓存还是只清除过期缓存
        if (clearCache) {
            this.fileDisplayCache.clearAll();
        } else {
            this.fileDisplayCache.clearExpired();
        }

        // 获取所有可见的、在启用目录中的文件
        const files = this.getVisibleFiles()
            .filter(file => this.filenameParser.isFileInEnabledFolder(file));
        
        // 批量处理文件
        if (files.length > 0) {
            this.batchProcessor.addToProcessQueue(files);
        }
    }
    
    // 获取可见文件
    private getVisibleFiles(): TFile[] {
        // 获取用户可见的文件
        const openFiles = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file 
            ? [this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file] 
            : [];
        
        // 获取当前打开文件夹中的所有文件
        const explorerFiles = this.plugin.app.vault.getMarkdownFiles();
        
        // 返回所有可见文件的唯一集合
        const uniqueFiles = Array.from(new Set([
            ...openFiles.filter((file): file is TFile => file instanceof TFile), 
            ...explorerFiles
        ]));
        return uniqueFiles;
    }
    
    // 获取批处理器实例
    public getBatchProcessor(): BatchProcessor {
        return this.batchProcessor;
    }
} 