import { TFile, TAbstractFile, MarkdownView } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
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
import { throttle } from '../utils';
import { FileEventType, FileEvent } from './EventManagerService';
import { ServiceContainer } from '../core/ServiceContainer';

// 主服务类，协调其他组件
export class FileDisplayService implements IFileDisplayService {
    private plugin: ITitleExtractorPlugin;
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

    /**
     * 静态工厂方法，从服务容器获取依赖
     */
    public static create(plugin: ITitleExtractorPlugin): FileDisplayService {
        const container = ServiceContainer.getInstance();
        
        // 从容器中获取依赖
        const filenameParser = container.get<IFilenameParser>('filenameParser');
        const fileDisplayCache = container.get<IFileDisplayCache>('fileDisplayCache');
        const fileExplorerDisplayService = container.get<IFileExplorerDisplayService>('fileExplorerDisplayService');
        const fileProcessorService = container.get<IFileProcessorService>('fileProcessorService');
        const markdownLinkService = container.get<IMarkdownLinkService>('markdownLinkService');
        
        // 安全获取 editorLinkDecorator 服务 - 这个服务可能不存在
        let editorLinkDecorator;
        try {
            // 检查 EditorLinkDecorator 服务是否已注册
            if (container.has('editorLinkDecorator')) {
                editorLinkDecorator = container.get<IEditorLinkDecorator>('editorLinkDecorator');
            } else {
                // 如果未注册，使用插件实例中的对象（可能为 null）
                editorLinkDecorator = plugin._linkDecorator;
            }
        } catch (error) {
            // 如果出错，设置为 null
            editorLinkDecorator = null;
        }
        
        const eventManager = container.get<IEventManagerService>('eventManager');
        const timerService = container.get<ITimerService>('timerService');
        const loggerService = container.get<ILoggerService>('loggerService');
        
        // 创建服务实例
        return new FileDisplayService(
            plugin,
            filenameParser,
            fileDisplayCache,
            fileExplorerDisplayService,
            fileProcessorService,
            markdownLinkService,
            editorLinkDecorator,
            eventManager,
            timerService,
            loggerService
        );
    }

    constructor(
        plugin: ITitleExtractorPlugin,
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
        
        // 订阅更新所有文件事件
        this.unsubscribers.push(
            this.eventManager.subscribe(FileEventType.UPDATE_ALL, (event) => {
                this.logger.log('收到更新所有文件事件');
                this.updateAllFilesDisplay(false);
                return Promise.resolve();
            })
        );
        
        this.logger.log('事件订阅设置完成');
    }
    
    // 处理文件事件
    private async handleFileEvent(event: FileEvent): Promise<void> {
        try {
            // 跳过file为null的事件(UPDATE_ALL类型事件会单独处理)
            if (!event.file) {
                return;
            }
            
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
        } catch (error) {
            // file可能为null，添加空检查
            const filePath = event.file ? event.file.path : 'unknown';
            this.logger.error(`处理文件事件失败: ${event.type} - 文件: ${filePath}`, error);
            
            // 尝试恢复缓存状态与实际文件状态的一致性
            if (event.file?.path) {
                // 清除可能不一致的缓存
                this.fileDisplayCache.deletePath(event.file.path);
                
                // 在下一个事件循环中尝试重新处理
                const file = event.file; // 保存引用，避免多次null检查
                setTimeout(() => {
                    try {
                        // 检查文件是否仍然存在
                        if (file && this.plugin.app.vault.getFileByPath(file.path)) {
                            this.updateFileExplorerDisplay(file).catch(err => {
                                this.logger.error(`恢复文件显示失败: ${file.path}`, err);
                            });
                        }
                    } catch (recoverError) {
                        if (file) {
                            this.logger.error(`尝试恢复文件显示时出错: ${file.path}`, recoverError);
                        } else {
                            this.logger.error(`尝试恢复文件显示时出错`, recoverError);
                        }
                    }
                }, 200);
            }
        }
    }

    // 处理各种文件操作
    public async handleFileOperation(file: TFile, operation: 'create' | 'modify' | 'rename' | 'delete' | 'metadata', oldPath?: string): Promise<void> {
        if (!file) {
            this.logger.error(`处理文件操作失败: 无效的文件对象, 操作类型: ${operation}`);
            return;
        }
        
        try {
            if (file?.path) {
                this.lastUpdatedFiles.add(file.path);
            }
            
            switch (operation) {
                case 'create':
                    try {
                        await this.fileProcessorService.processFile(file);
                    } catch (error) {
                        this.logger.error(`处理新建文件失败: ${file.path}`, error);
                        throw error; // 向上传递错误以触发恢复机制
                    }
                    
                    try {
                        await this.updateFileExplorerDisplay(file);
                    } catch (error) {
                        this.logger.error(`更新新建文件显示失败: ${file.path}`, error);
                        // 清除缓存以便下次尝试
                        if (file?.path) this.fileDisplayCache.deletePath(file.path);
                    }
                    
                    try {
                        this.markdownLinkService.updateMarkdownLinksForFile(file);
                    } catch (error) {
                        this.logger.error(`更新新建文件链接失败: ${file.path}`, error);
                    }
                    break;
                    
                case 'modify':
                    // 清除该文件的缓存，强制重新处理
                    if (file?.path) {
                        this.fileDisplayCache.deletePath(file.path);
                    }
                    
                    try {
                        await this.fileProcessorService.processFile(file);
                    } catch (error) {
                        this.logger.error(`处理修改文件失败: ${file.path}`, error);
                        throw error; // 向上传递错误以触发恢复机制
                    }
                    
                    try {
                        await this.updateFileExplorerDisplay(file);
                    } catch (error) {
                        this.logger.error(`更新修改文件显示失败: ${file.path}`, error);
                        // 清除缓存以便下次尝试
                        if (file?.path) this.fileDisplayCache.deletePath(file.path);
                    }
                    
                    try {
                        this.markdownLinkService.updateMarkdownLinksForFile(file);
                    } catch (error) {
                        this.logger.error(`更新修改文件链接失败: ${file.path}`, error);
                    }
                    
                    // 检查当前活跃编辑器，如果存在则刷新链接装饰
                    try {
                        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                        if (view && view.editor && this.editorLinkDecorator) {
                            this.editorLinkDecorator.processLinks();
                        }
                    } catch (error) {
                        this.logger.error(`更新编辑器链接装饰失败`, error);
                    }
                    break;
                    
                case 'rename':
                    if (oldPath) {
                        try {
                            // 清除旧路径的缓存
                            this.fileDisplayCache.deletePath(oldPath);
                        } catch (error) {
                            this.logger.error(`清除重命名文件旧路径缓存失败: ${oldPath}`, error);
                        }
                    }
                    
                    // 处理新路径
                    try {
                        await this.fileProcessorService.processFile(file);
                    } catch (error) {
                        this.logger.error(`处理重命名文件失败: ${file.path}`, error);
                        throw error; // 向上传递错误以触发恢复机制
                    }
                    
                    try {
                        await this.updateFileExplorerDisplay(file);
                    } catch (error) {
                        this.logger.error(`更新重命名文件显示失败: ${file.path}`, error);
                        // 清除缓存以便下次尝试
                        if (file?.path) this.fileDisplayCache.deletePath(file.path);
                    }
                    
                    try {
                        this.markdownLinkService.updateMarkdownLinksForFile(file);
                    } catch (error) {
                        this.logger.error(`更新重命名文件链接失败: ${file.path}`, error);
                    }
                    break;
                    
                case 'delete':
                    if (file?.path) {
                        try {
                            // 从缓存中删除
                            this.fileDisplayCache.deletePath(file.path);
                        } catch (error) {
                            this.logger.error(`清除已删除文件缓存失败: ${file.path}`, error);
                        }
                    }
                    break;
                    
                case 'metadata':
                    if (file?.path) {
                        try {
                            // 清除缓存
                            this.fileDisplayCache.deletePath(file.path);
                        } catch (error) {
                            this.logger.error(`清除元数据更新文件缓存失败: ${file.path}`, error);
                        }
                        
                        try {
                            await this.fileProcessorService.processFile(file);
                        } catch (error) {
                            this.logger.error(`处理元数据更新文件失败: ${file.path}`, error);
                            throw error; // 向上传递错误以触发恢复机制
                        }
                        
                        try {
                            await this.updateFileExplorerDisplay(file);
                        } catch (error) {
                            this.logger.error(`更新元数据更新文件显示失败: ${file.path}`, error);
                            // 清除缓存以便下次尝试
                            this.fileDisplayCache.deletePath(file.path);
                        }
                        
                        try {
                            this.markdownLinkService.updateMarkdownLinksForFile(file);
                        } catch (error) {
                            this.logger.error(`更新元数据更新文件链接失败: ${file.path}`, error);
                        }
                    }
                    break;
            }
        } catch (error) {
            this.logger.error(`文件操作处理失败: ${operation}, 文件: ${file.path}`, error);
            
            // 确保缓存与实际文件状态一致
            if (file?.path) {
                this.fileDisplayCache.deletePath(file.path);
                
                // 触发文件资源管理器刷新
                this.eventManager.dispatch({
                    type: FileEventType.EXPLORER_REFRESH,
                    file: file
                }).catch(err => {
                    this.logger.error(`触发资源管理器刷新失败`, err);
                });
            }
            
            // 向上抛出错误以便调用者可以进一步处理
            throw error;
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
        
        // 首先恢复所有文件的原始显示名称
        this.restoreAllDisplayNames();
        
        // 取消所有事件订阅
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
        this.unsubscribers = [];
        
        // 清空上次更新文件集合
        this.lastUpdatedFiles.clear();
        
        // 停止任何可能正在进行的计时器
        this.timerService.clearAll();
        
        this.logger.log('FileDisplayService 资源已释放');
    }
} 