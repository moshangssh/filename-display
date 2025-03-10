import { TFile, MarkdownView, WorkspaceLeaf } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';
import { BatchProcessor } from './BatchProcessor';
import { ITimerService, ILoggerService } from './interfaces/IServices';

export class FileProcessorService {
    private plugin: ITitleExtractorPlugin;
    private filenameParser: FilenameParser;
    private fileDisplayCache: FileDisplayCache;
    private batchProcessor: BatchProcessor;
    private timerService: ITimerService;
    private logger: ILoggerService;
    
    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: FileDisplayCache,
        timerService: ITimerService,
        loggerService: ILoggerService,
        updateFileDisplayFn: (file: TFile) => Promise<void>
    ) {
        this.plugin = plugin;
        this.filenameParser = filenameParser;
        this.fileDisplayCache = fileDisplayCache;
        this.timerService = timerService;
        this.logger = loggerService.getLogger('FileProcessorService');
        
        // 初始化批处理器，传入timerService
        this.batchProcessor = new BatchProcessor(
            updateFileDisplayFn,
            this.timerService,
            50
        );
        
        this.logger.info('FileProcessorService 初始化完成');
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
    public updateAllFilesDisplay(clearCache = true): void {
        // 根据参数决定是清除所有缓存还是只清除过期缓存
        if (clearCache) {
            this.fileDisplayCache.clearAll();
        } else {
            this.fileDisplayCache.clearExpired();
        }

        // 获取所有启用目录中的文件
        const allEligibleFiles = this.plugin.app.vault.getMarkdownFiles()
            .filter(file => this.filenameParser.isFileInEnabledFolder(file));
        
        if (allEligibleFiles.length === 0) return;

        // 分离可见文件和其他文件
        const { visibleFiles, otherFiles } = this.separateFilesByVisibility(allEligibleFiles);
        
        // 先处理可见文件
        if (visibleFiles.length > 0) {
            this.batchProcessor.addToProcessQueue(visibleFiles, true); // 高优先级
        }
        
        // 然后处理其他文件
        if (otherFiles.length > 0) {
            this.batchProcessor.addToProcessQueue(otherFiles, false); // 低优先级
        }
    }
    
    // 将文件分为可见文件和其他文件
    public separateFilesByVisibility(files: TFile[]): { visibleFiles: TFile[], otherFiles: TFile[] } {
        // 获取当前所有可见的文件
        const visibleFiles = new Set<string>();
        
        // 添加当前活动编辑器中的文件
        const activeFile = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (activeFile) {
            visibleFiles.add(activeFile.path);
        }
        
        // 添加所有当前打开的标签页中的文件
        this.plugin.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
            // 安全地获取文件
            const fileFromView = leaf.view instanceof MarkdownView ? leaf.view.file : null;
            if (fileFromView instanceof TFile) {
                visibleFiles.add(fileFromView.path);
            }
        });
        
        // 分离文件
        const visible: TFile[] = [];
        const others: TFile[] = [];
        
        for (const file of files) {
            if (visibleFiles.has(file.path)) {
                visible.push(file);
            } else {
                others.push(file);
            }
        }
        
        return { visibleFiles: visible, otherFiles: others };
    }
    
    // 获取可见文件（原方法，保留以兼容性）
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