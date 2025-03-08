import { TFile, TAbstractFile } from 'obsidian';
import type { IFilenameDisplayPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';
import { FileExplorerDisplayService } from './FileExplorerDisplayService';
import { FileProcessorService } from './FileProcessorService';
import { MarkdownLinkService } from './MarkdownLinkService';
import { EventManagerService } from './EventManagerService';
import { EditorLinkDecorator } from './EditorLinkDecorator';
import { MarkdownView } from 'obsidian';

// 主服务类，协调其他组件
export class FileDisplayService {
    private plugin: IFilenameDisplayPlugin;
    private filenameParser: FilenameParser;
    private fileDisplayCache: FileDisplayCache;
    
    // 专门的服务
    private fileExplorerDisplayService: FileExplorerDisplayService;
    private fileProcessorService: FileProcessorService;
    private markdownLinkService: MarkdownLinkService;
    private eventManagerService: EventManagerService;
    private editorLinkDecorator: EditorLinkDecorator;
    
    private updateTimer: number | null = null;

    constructor(plugin: IFilenameDisplayPlugin) {
        this.plugin = plugin;
        
        // 初始化基础组件
        this.filenameParser = new FilenameParser(plugin);
        this.fileDisplayCache = new FileDisplayCache();
        
        // 初始化处理器服务
        this.fileProcessorService = new FileProcessorService(
            plugin,
            this.filenameParser,
            this.fileDisplayCache,
            async (file) => this.updateFileExplorerDisplay(file)
        );
        
        // 初始化文件资源管理器显示服务
        this.fileExplorerDisplayService = new FileExplorerDisplayService(
            plugin,
            this.filenameParser,
            this.fileDisplayCache,
            () => this.updateAllFilesDisplay(),
            (file) => this.updateFileExplorerDisplay(file),
            (nodes) => this.updateAddedNodes(nodes)
        );
        
        // 初始化 Markdown 链接服务
        this.markdownLinkService = new MarkdownLinkService(
            plugin,
            this.filenameParser,
            this.fileDisplayCache
        );
        
        // 初始化编辑器链接装饰器
        this.editorLinkDecorator = new EditorLinkDecorator(
            plugin,
            this.filenameParser,
            this.fileDisplayCache
        );
        
        // 初始化事件管理器
        this.eventManagerService = new EventManagerService(
            plugin,
            // 文件创建回调
            (file) => this.onFileCreate(file),
            // 文件修改回调
            (file) => this.onFileModify(file),
            // 文件重命名回调
            (file, oldPath) => this.onFileRename(file, oldPath),
            // 文件删除回调
            (file) => this.onFileDelete(file),
            // 元数据变更回调
            (file) => this.onMetadataChange(file)
        );
        
        // 改用布局就绪事件初始化
        this.plugin.app.workspace.onLayoutReady(() => {
            this.fileExplorerDisplayService.setupObservers();
            this.eventManagerService.setupVaultEventListeners();
            this.eventManagerService.setupMetadataEventListeners();
            this.updateAllFilesDisplay();
        });
    }
    
    // 文件创建事件处理
    private onFileCreate(file: TFile): void {
        this.fileProcessorService.processFile(file);
        this.updateFileExplorerDisplay(file);
        this.markdownLinkService.updateMarkdownLinksForFile(file);
    }
    
    // 文件修改事件处理
    private onFileModify(file: TFile): void {
        // 清除该文件的缓存，强制重新处理
        this.fileDisplayCache.deletePath(file.path);
        this.fileProcessorService.processFile(file);
        this.updateFileExplorerDisplay(file);
        this.markdownLinkService.updateMarkdownLinksForFile(file);
        
        // 检查当前活跃编辑器，如果存在则刷新链接装饰
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor) {
            // 如果当前编辑的就是修改的文件，或者文件包含对修改文件的链接，都需要刷新装饰
            this.editorLinkDecorator.updateEditorLinkDecorations(view.editor, view);
        }
    }
    
    // 文件重命名事件处理
    private onFileRename(file: TFile, oldPath: string): void {
        // 清除旧路径的缓存
        this.fileDisplayCache.deletePath(oldPath);
        // 处理新路径
        this.fileProcessorService.processFile(file);
        this.updateFileExplorerDisplay(file);
        this.markdownLinkService.updateMarkdownLinksForFile(file);
    }
    
    // 文件删除事件处理
    private onFileDelete(file: TAbstractFile): void {
        // 从缓存中移除已删除的文件
        this.fileDisplayCache.deletePath(file.path);
    }
    
    // 元数据更改事件处理
    private onMetadataChange(file: TFile): void {
        this.updateFileExplorerDisplay(file);
    }
    
    // 更新添加的节点
    private updateAddedNodes(nodes: Node[]): void {
        this.fileExplorerDisplayService.updateAddedNodes(nodes);
    }
    
    // 更新文件资源管理器中的文件显示
    public async updateFileExplorerDisplay(file: TFile): Promise<void> {
        await this.fileExplorerDisplayService.updateFileExplorerDisplay(file);
    }
    
    // 更新所有文件的显示
    public updateAllFilesDisplay(clearCache: boolean = true): void {
        this.fileProcessorService.updateAllFilesDisplay(clearCache);
        
        // 更新当前编辑器中的链接装饰
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor) {
            this.editorLinkDecorator.updateEditorLinkDecorations(view.editor, view);
        }
    }
    
    // 恢复所有原始显示名称
    public restoreAllDisplayNames(): void {
        this.fileExplorerDisplayService.restoreAllDisplayNames();
        
        // 清理编辑器装饰
        if (this.editorLinkDecorator) {
            this.editorLinkDecorator.clearDecorations();
        }
        
        if (this.updateTimer) {
            window.clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }
    
    // 重置观察器
    public resetObservers(): void {
        this.fileExplorerDisplayService.resetObservers();
    }
    
    // 获取缓存实例
    public getCache(): FileDisplayCache {
        return this.fileDisplayCache;
    }
} 