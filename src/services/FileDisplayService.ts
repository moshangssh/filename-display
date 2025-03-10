import { TFile, TAbstractFile, MarkdownView } from 'obsidian';
import type { ITitleExctratorPlugin, FileDisplayResult } from '../types';
import { 
    IFileDisplayService, 
    IFilenameParser, 
    IFileDisplayCache, 
    IFileExplorerDisplayService, 
    IFileProcessorService, 
    IMarkdownLinkService, 
    IEditorLinkDecorator, 
    IEventManagerService, 
    ITimerService,
    ILoggerService
} from './interfaces/IServices';
import { ServiceContainer, SERVICE_TYPES } from './di/ServiceContainer';
import { throttle } from '../utils';
import { FileEventType, FileEvent } from './EventManagerService';

// 主服务类，协调其他组件
export class FileDisplayService implements IFileDisplayService {
    private plugin: ITitleExctratorPlugin;
    private filenameParser: IFilenameParser;
    private fileDisplayCache: IFileDisplayCache;
    private fileExplorerDisplayService: IFileExplorerDisplayService;
    private fileProcessorService: IFileProcessorService;
    private markdownLinkService: IMarkdownLinkService;
    private editorLinkDecorator: IEditorLinkDecorator;
    private eventManager: IEventManagerService;
    private timerService: ITimerService;
    private logger: ILoggerService;
    private throttledUpdateAllFilesDisplay: (clearCache?: boolean) => void;
    private lastUpdatedFiles: Set<string> = new Set(); // 用于记录上次更新的文件
    private unsubscribers: (() => void)[] = []; // 存储取消订阅函数

    constructor(
        plugin: ITitleExctratorPlugin,
        filenameParser: IFilenameParser,
        fileDisplayCache: IFileDisplayCache,
        fileExplorerDisplayService: IFileExplorerDisplayService,
        fileProcessorService: IFileProcessorService,
        markdownLinkService: IMarkdownLinkService,
        editorLinkDecorator: IEditorLinkDecorator,
        eventManager: IEventManagerService,
        timerService: ITimerService,
        loggerService: ILoggerService
    ) {
        this.plugin = plugin;
        this.filenameParser = filenameParser;
        this.fileDisplayCache = fileDisplayCache;
        this.fileExplorerDisplayService = fileExplorerDisplayService;
        this.fileProcessorService = fileProcessorService;
        this.markdownLinkService = markdownLinkService;
        this.editorLinkDecorator = editorLinkDecorator;
        this.eventManager = eventManager;
        this.timerService = timerService;
        this.logger = loggerService.getLogger('FileDisplayService');
        
        // 使用节流函数包装更新函数，避免短时间内多次更新
        this.throttledUpdateAllFilesDisplay = throttle(
            (clearCache?: boolean) => this.performUpdateAllFilesDisplay(clearCache), 
            3000,
            this.timerService
        );
        
        // 设置事件订阅
        this.setupEventSubscriptions();
        
        this.logger.info('FileDisplayService 初始化完成');
    }
    
    // 设置事件订阅
    private setupEventSubscriptions(): void {
        this.logger.log('设置事件订阅...');
        
        // 订阅文件创建事件
        this.unsubscribers.push(
            this.eventManager.subscribe(FileEventType.CREATE, this.handleFileEvent.bind(this))
        );
        
        // 订阅文件修改事件
        this.unsubscribers.push(
            this.eventManager.subscribe(FileEventType.MODIFY, this.handleFileEvent.bind(this))
        );
        
        // 订阅文件重命名事件
        this.unsubscribers.push(
            this.eventManager.subscribe(FileEventType.RENAME, this.handleFileEvent.bind(this))
        );
        
        // 订阅文件删除事件
        this.unsubscribers.push(
            this.eventManager.subscribe(FileEventType.DELETE, this.handleFileEvent.bind(this))
        );
        
        // 订阅元数据变更事件
        this.unsubscribers.push(
            this.eventManager.subscribe(FileEventType.METADATA, this.handleFileEvent.bind(this))
        );
        
        this.logger.log('事件订阅设置完成');
    }
    
    // 处理文件事件
    private async handleFileEvent(event: FileEvent): Promise<void> {
        this.logger.log(`处理文件事件: ${event.type} - 文件: ${event.file.path}`);
        
        const file = event.file;
        
        switch (event.type) {
            case FileEventType.CREATE:
                await this.handleFileOperation(file, 'create');
                break;
                
            case FileEventType.MODIFY:
                await this.handleFileOperation(file, 'modify');
                break;
                
            case FileEventType.RENAME:
                await this.handleFileOperation(file, 'rename', event.oldPath);
                break;
                
            case FileEventType.DELETE:
                await this.handleFileOperation(file, 'delete');
                break;
                
            case FileEventType.METADATA:
                await this.handleFileOperation(file, 'metadata');
                break;
                
            default:
                this.logger.log(`未处理的事件类型: ${event.type}`);
        }
    }

    // 处理各种文件操作
    public async handleFileOperation(file: TFile, operation: 'create' | 'modify' | 'rename' | 'delete' | 'metadata', oldPath?: string): Promise<void> {
        if (file?.path) {
            this.lastUpdatedFiles.add(file.path);
        }
        
        switch (operation) {
            case 'create':
                await this.fileProcessorService.processFile(file);
                await this.updateFileExplorerDisplay(file);
                this.markdownLinkService.updateMarkdownLinksForFile(file);
                break;
                
            case 'modify':
                // 清除该文件的缓存，强制重新处理
                if (file?.path) {
                    this.fileDisplayCache.deletePath(file.path);
                }
                await this.fileProcessorService.processFile(file);
                await this.updateFileExplorerDisplay(file);
                this.markdownLinkService.updateMarkdownLinksForFile(file);
                
                // 检查当前活跃编辑器，如果存在则刷新链接装饰
                const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (view && view.editor) {
                    this.editorLinkDecorator.processLinks();
                }
                break;
                
            case 'rename':
                if (oldPath) {
                    // 清除旧路径的缓存
                    this.fileDisplayCache.deletePath(oldPath);
                }
                // 处理新路径
                await this.fileProcessorService.processFile(file);
                await this.updateFileExplorerDisplay(file);
                this.markdownLinkService.updateMarkdownLinksForFile(file);
                break;
                
            case 'delete':
                if (file?.path) {
                    // 从缓存中删除
                    this.fileDisplayCache.deletePath(file.path);
                }
                break;
                
            case 'metadata':
                if (file?.path) {
                    // 清除缓存并重新处理
                    this.fileDisplayCache.deletePath(file.path);
                    await this.fileProcessorService.processFile(file);
                    await this.updateFileExplorerDisplay(file);
                    this.markdownLinkService.updateMarkdownLinksForFile(file);
                }
                break;
        }
    }

    public async updateFileExplorerDisplay(file: TFile): Promise<void> {
        return this.fileExplorerDisplayService.updateFileExplorerDisplay(file);
    }

    public updateAllFilesDisplay(clearCache: boolean = true): void {
        this.throttledUpdateAllFilesDisplay(clearCache);
    }

    private async performUpdateAllFilesDisplay(clearCache: boolean = true): Promise<void> {
        this.logger.log('更新所有文件显示...');
        
        try {
            // 直接使用fileProcessorService的方法，它会处理缓存清理
            this.fileProcessorService.updateAllFilesDisplay(clearCache);
            
            // 获取文件数量用于日志
            const files = this.plugin.app.vault.getMarkdownFiles();
            this.logger.log(`已更新所有 ${files.length} 个文件的显示`);
        } catch (error) {
            this.logger.error('更新所有文件显示时发生错误:', error);
        }
    }

    public restoreAllDisplayNames(): void {
        try {
            // 恢复文件浏览器中的原始文件名
            this.fileExplorerDisplayService.restoreAllDisplayNames();
        } catch (error) {
            this.logger.error('恢复所有显示名称时发生错误:', error);
        }
    }

    public resetObservers(): void {
        this.fileExplorerDisplayService.resetObservers();
    }

    public getCache(): IFileDisplayCache {
        return this.fileDisplayCache;
    }

    public dispose(): void {
        this.logger.log('释放 FileDisplayService 资源...');
        
        // 取消所有事件订阅
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
        this.unsubscribers = [];
        
        // 清空上次更新文件集合
        this.lastUpdatedFiles.clear();
        
        this.logger.log('FileDisplayService 资源已释放');
    }
} 