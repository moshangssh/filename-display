import { TFile, TAbstractFile, MarkdownView } from 'obsidian';
import type { IFilenameDisplayPlugin, FileDisplayResult } from '../types';
import { 
    IFileDisplayService, 
    IFilenameParser, 
    IFileDisplayCache, 
    IFileExplorerDisplayService, 
    IFileProcessorService, 
    IMarkdownLinkService, 
    IEditorLinkDecorator, 
    IEventManagerService, 
    ITimerService 
} from './interfaces/IServices';
import { Logger } from '../utils/logger';
import { ServiceContainer, SERVICE_TYPES } from './di/ServiceContainer';

// 创建日志记录器
const logger = new Logger('FileDisplayService');

// 主服务类，协调其他组件
export class FileDisplayService implements IFileDisplayService {
    private plugin: IFilenameDisplayPlugin;
    private filenameParser: IFilenameParser;
    private fileDisplayCache: IFileDisplayCache;
    private fileExplorerDisplayService: IFileExplorerDisplayService;
    private fileProcessorService: IFileProcessorService;
    private markdownLinkService: IMarkdownLinkService;
    private eventManagerService: IEventManagerService;
    private editorLinkDecorator: IEditorLinkDecorator;
    private timerService: ITimerService;
    private updateTimer: number | null = null;

    constructor(
        plugin: IFilenameDisplayPlugin,
        container: ServiceContainer
    ) {
        this.plugin = plugin;
        
        // 从服务容器获取服务
        this.filenameParser = container.get<IFilenameParser>(SERVICE_TYPES.FilenameParser);
        this.fileDisplayCache = container.get<IFileDisplayCache>(SERVICE_TYPES.FileDisplayCache);
        this.fileExplorerDisplayService = container.get<IFileExplorerDisplayService>(SERVICE_TYPES.FileExplorerDisplayService);
        this.fileProcessorService = container.get<IFileProcessorService>(SERVICE_TYPES.FileProcessorService);
        this.markdownLinkService = container.get<IMarkdownLinkService>(SERVICE_TYPES.MarkdownLinkService);
        this.editorLinkDecorator = container.get<IEditorLinkDecorator>(SERVICE_TYPES.EditorLinkDecorator);
        this.eventManagerService = container.get<IEventManagerService>(SERVICE_TYPES.EventManagerService);
        this.timerService = container.get<ITimerService>(SERVICE_TYPES.TimerService);
        
        // 改用布局就绪事件初始化
        this.plugin.app.workspace.onLayoutReady(() => {
            this.fileExplorerDisplayService.setupObservers();
            this.eventManagerService.setupVaultEventListeners();
            this.eventManagerService.setupMetadataEventListeners();
            this.updateAllFilesDisplay();
        });
    }
    
    // 文件创建事件处理
    public onFileCreate(file: TFile): void {
        this.fileProcessorService.processFile(file);
        this.updateFileExplorerDisplay(file);
        this.markdownLinkService.updateMarkdownLinksForFile(file);
    }
    
    // 文件修改事件处理
    public onFileModify(file: TFile): void {
        // 清除该文件的缓存，强制重新处理
        this.fileDisplayCache.deletePath(file.path);
        this.fileProcessorService.processFile(file);
        this.updateFileExplorerDisplay(file);
        this.markdownLinkService.updateMarkdownLinksForFile(file);
        
        // 检查当前活跃编辑器，如果存在则刷新链接装饰
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.editor) {
            // 如果当前编辑的就是修改的文件，或者文件包含对修改文件的链接，都需要刷新装饰
            this.editorLinkDecorator.processLinks();
        }
    }
    
    // 文件重命名事件处理
    public onFileRename(file: TFile, oldPath: string): void {
        // 清除旧路径的缓存
        this.fileDisplayCache.deletePath(oldPath);
        // 处理新路径
        this.fileProcessorService.processFile(file);
        this.updateFileExplorerDisplay(file);
        this.markdownLinkService.updateMarkdownLinksForFile(file);
    }
    
    // 文件删除事件处理
    public onFileDelete(file: TAbstractFile): void {
        // 从缓存中移除已删除的文件
        this.fileDisplayCache.deletePath(file.path);
    }
    
    // 元数据更改事件处理
    public onMetadataChange(file: TFile): void {
        this.updateFileExplorerDisplay(file);
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
        // 确保视图存在、是编辑模式、且有有效的编辑器
        if (view && view.editor && 
            // 确保视图不是预览模式
            !(view as any).previewMode &&
            // 确保设置中启用了装饰功能
            this.plugin.settings.enableEditorLinkDecorations) {
            try {
                this.editorLinkDecorator.processLinks();
            } catch (error) {
                logger.error("更新编辑器链接装饰时发生错误", error);
            }
        }
    }
    
    // 恢复所有原始显示名称
    public restoreAllDisplayNames(): void {
        this.fileExplorerDisplayService.restoreAllDisplayNames();
        
        // 清理编辑器装饰
        if (this.editorLinkDecorator) {
            this.editorLinkDecorator.dispose();
        }
    }
    
    // 重置观察器
    public resetObservers(): void {
        this.fileExplorerDisplayService.resetObservers();
    }
    
    // 获取缓存实例
    public getCache(): IFileDisplayCache {
        return this.fileDisplayCache;
    }
    
    // 清理所有资源的方法
    public dispose(): void {
        // 清理所有定时器
        if (this.timerService) {
            this.timerService.clearAll();
        }
        
        if (this.updateTimer) {
            window.clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
        
        // 停止缓存清理
        if (this.fileDisplayCache) {
            this.fileDisplayCache.stopPeriodicCleanup();
        }
        
        // 清理文件资源管理器观察器
        if (this.fileExplorerDisplayService) {
            this.fileExplorerDisplayService.resetObservers();
        }
        
        // 清理编辑器装饰器
        if (this.editorLinkDecorator) {
            this.editorLinkDecorator.dispose();
        }
        
        // 清理事件管理器
        if (this.eventManagerService) {
            this.eventManagerService.dispose();
        }
        
        // 恢复所有显示名称
        this.restoreAllDisplayNames();
    }
} 