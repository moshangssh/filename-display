import { App, Editor, MarkdownView, Notice, Plugin, TFile, TAbstractFile, editorViewField } from 'obsidian';
import { TitleExtractorSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { TitleExtractorSettingTab } from './settings/SettingsTab';
import { FileDisplayService } from './services/FileDisplayService';
import { FilenameParser } from './services/FilenameParser';
import { FileDisplayCache } from './services/FileDisplayCache';
import { FileExplorerDisplayService } from './services/FileExplorerDisplayService';
import { FileProcessorService } from './services/FileProcessorService';
import { MarkdownLinkService } from './services/MarkdownLinkService';
import { EventManagerService } from './services/EventManagerService';
import { EditorLinkDecorator } from './services/EditorLinkDecorator';
import { TimerService } from './services/TimerService';
import { ServiceContainer, SERVICE_TYPES } from './services/di/ServiceContainer';
import { LoggerService } from './services/LoggerService';
import { errorHandler } from './utils/ErrorHandler';
import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { IEditorLinkDecorator, IFileExplorerDisplayService, CacheCleanStrategy } from './services/interfaces/IServices';
import { ExtensionCacheService, ExtensionType } from './services/ExtensionCacheService';
import { getEditorView } from './utils/editor-utils';
import { 
    viewportExtension, 
    incrementalUpdateExtension, 
    editorSyncExtension,
    removeLinkDecoration
} from './extensions';
import { Logger } from './utils/logger';
import { LinkStateManager } from './services/LinkStateManager';
import { LinkDecorationExtensionProvider } from './services/LinkDecorationExtensionProvider';

const logger = new Logger('Plugin');

export default class TitleExtractorPlugin extends Plugin {
    settings: TitleExtractorSettings;
    serviceContainer: ServiceContainer;
    private fileDisplayService: FileDisplayService;
    private editorExtensions: Extension[] = [];
    // 核心服务组件，直接作为插件属性
    filenameParser: FilenameParser;
    fileDisplayCache: FileDisplayCache;
    fileProcessorService: FileProcessorService;
    markdownLinkService: MarkdownLinkService;
    eventManager: EventManagerService;
    loggerService: LoggerService;
    timerService: TimerService;
    linkStateManager: LinkStateManager;
    
    private extensionCacheService: ExtensionCacheService;

    async onload() {
        await this.loadSettings();
        logger.log('加载插件设置...');

        // 添加设置选项卡
        this.addSettingTab(new TitleExtractorSettingTab(this.app, this));

        try {
            // 创建服务容器
            this.serviceContainer = ServiceContainer.getInstance(this);
            
            // 直接初始化核心服务
            this.initCoreServices();
            
            // 注册其他服务到容器
            this.registerServices();
            
            // 设置文件浏览器
            this.setupFileExplorer();
            
            // 注册编辑器扩展
            this.registerStandardEditorExtensions();
            
            // 预热缓存
            await this.warmUpCache();
            
            // 注册事件监听
            this.registerEvents();
            
            logger.log('插件加载完成');
        } catch (error) {
            logger.error('插件加载时发生错误:', error);
            new Notice('TitleExtractor插件加载失败');
        }
    }
    
    /**
     * 初始化核心服务组件
     */
    private initCoreServices(): void {
        // 初始化核心服务，减少对容器的依赖
        this.loggerService = new LoggerService();
        this.timerService = new TimerService(this);
        this.filenameParser = new FilenameParser(this, this.loggerService);
        
        // 正确初始化FileDisplayCache，传入正确的类型参数
        this.fileDisplayCache = new FileDisplayCache(
            (cleanupCallback: () => void) => this.timerService.setInterval(cleanupCallback, 60000),
            this,
            this.loggerService
        );
        
        // 使用插件作为参数（而不是app）
        this.eventManager = new EventManagerService(this, this.loggerService);
        this.linkStateManager = new LinkStateManager(this);
        
        // 初始化扩展缓存服务
        this.extensionCacheService = new ExtensionCacheService(this);
        
        // 创建临时更新文件显示的函数，稍后会更新
        const tempUpdateFileFn = async (file: TFile) => {
            // 临时实现，稍后会被fileDisplayService的方法替代
            console.log('Temporary file display update function');
        };
        
        // 初始化依赖其他服务的组件
        this.fileProcessorService = new FileProcessorService(
            this,
            this.filenameParser,
            this.fileDisplayCache,
            this.timerService,
            this.loggerService,
            tempUpdateFileFn
        );
        
        this.markdownLinkService = new MarkdownLinkService(
            this,
            this.filenameParser,
            this.fileDisplayCache
        );
    }

    /**
     * 注册所有服务
     */
    private registerServices() {
        // 注册日志服务（首先注册，因为其他服务可能依赖它）
        this.serviceContainer.register(
            SERVICE_TYPES.LoggerService, 
            this.loggerService
        );
        
        // 注册错误处理服务
        this.serviceContainer.register(
            SERVICE_TYPES.ErrorHandler, 
            errorHandler
        );
        
        // 注册定时器服务
        this.serviceContainer.register(
            SERVICE_TYPES.TimerService, 
            this.timerService
        );
        
        // 注册扩展缓存服务
        this.serviceContainer.register(
            SERVICE_TYPES.ExtensionCacheService,
            this.extensionCacheService
        );
        
        // 注册链接状态管理器服务
        this.serviceContainer.register(
            SERVICE_TYPES.LinkStateManager,
            this.linkStateManager
        );
        
        // 注册链接装饰扩展提供者服务
        this.serviceContainer.register(
            SERVICE_TYPES.LinkDecorationExtensionProvider,
            new LinkDecorationExtensionProvider(this)
        );
        
        // 注册文件名解析服务（通过工厂函数）
        this.serviceContainer.registerFactory(
            SERVICE_TYPES.FilenameParser, 
            () => this.filenameParser
        );
        
        // 注册文件显示缓存服务（通过工厂函数）
        this.serviceContainer.registerFactory(
            SERVICE_TYPES.FileDisplayCache, 
            () => this.fileDisplayCache
        );
        
        // 注册事件管理服务（通过工厂函数）
        this.serviceContainer.registerFactory(
            SERVICE_TYPES.EventManagerService,
            () => this.eventManager
        );
        
        // 注册文件资源管理器显示服务（通过工厂函数）
        this.serviceContainer.registerFactory(
            SERVICE_TYPES.FileExplorerDisplayService, 
            (container) => new FileExplorerDisplayService(
                this,
                container.get(SERVICE_TYPES.FilenameParser),
                container.get(SERVICE_TYPES.FileDisplayCache),
                container.get(SERVICE_TYPES.EventManagerService),
                container.get(SERVICE_TYPES.LoggerService)
            )
        );
        
        // 注册文件处理服务（通过工厂函数）
        this.serviceContainer.registerFactory(
            SERVICE_TYPES.FileProcessorService, 
            (container) => new FileProcessorService(
                this,
                container.get(SERVICE_TYPES.FilenameParser),
                container.get(SERVICE_TYPES.FileDisplayCache),
                container.get(SERVICE_TYPES.TimerService),
                container.get(SERVICE_TYPES.LoggerService),
                async (file: TFile) => {
                    // 直接使用FileExplorerDisplayService更新文件
                    const fileExplorerDisplayService = container.get<IFileExplorerDisplayService>(SERVICE_TYPES.FileExplorerDisplayService);
                    return fileExplorerDisplayService.updateFileExplorerDisplay(file);
                }
            )
        );
        
        // 注册Markdown链接服务（通过工厂函数）
        this.serviceContainer.registerFactory(
            SERVICE_TYPES.MarkdownLinkService, 
            () => this.markdownLinkService
        );
        
        // 注册编辑器链接装饰器服务（通过工厂函数）
        this.serviceContainer.registerFactory(
            SERVICE_TYPES.EditorLinkDecorator, 
            (container) => new EditorLinkDecorator(
                this,
                container.get(SERVICE_TYPES.FilenameParser),
                container.get(SERVICE_TYPES.FileDisplayCache)
            )
        );
        
        // 注册主文件显示服务（通过工厂函数）
        this.serviceContainer.registerFactory(
            SERVICE_TYPES.FileDisplayService, 
            (container) => new FileDisplayService(
                this,
                container.get(SERVICE_TYPES.FilenameParser),
                container.get(SERVICE_TYPES.FileDisplayCache),
                container.get(SERVICE_TYPES.FileExplorerDisplayService),
                container.get(SERVICE_TYPES.FileProcessorService),
                container.get(SERVICE_TYPES.MarkdownLinkService),
                container.get(SERVICE_TYPES.EditorLinkDecorator),
                container.get(SERVICE_TYPES.EventManagerService),
                container.get(SERVICE_TYPES.TimerService),
                container.get(SERVICE_TYPES.LoggerService)
            )
        );
        
        // 设置事件监听器
        const eventManagerService = this.serviceContainer.get<EventManagerService>(SERVICE_TYPES.EventManagerService);
        eventManagerService.setupVaultEventListeners();
        eventManagerService.setupMetadataEventListeners();
        
        // 获取主文件显示服务
        this.fileDisplayService = this.serviceContainer.get<FileDisplayService>(SERVICE_TYPES.FileDisplayService);
    }

    onunload() {
        // 恢复所有显示名称并清理资源
        logger.log('卸载TitleExtractor插件...');
        
        try {
            // 取消任何正在进行的缓存预热
            try {
                const fileDisplayCache = this.serviceContainer?.get<FileDisplayCache>(SERVICE_TYPES.FileDisplayCache);
                if (fileDisplayCache) {
                    logger.log('取消正在进行的缓存预热...');
                    if (fileDisplayCache.isWarmingUp()) {
                        fileDisplayCache.cancelWarmupCache();
                        logger.log('已取消缓存预热');
                    }
                }
            } catch (e) {
                logger.error('取消缓存预热时出错:', e);
            }
            
            // 清理所有活跃编辑器中的 CodeMirror 装饰
            this.cleanupAllCodeMirrorDecorations();
            
            // 显式卸载编辑器扩展
            if (this.editorExtensions.length) {
                this.app.workspace.updateOptions();
            }
            
            // 恢复所有文件显示（必要的自定义清理）
            if (this.fileDisplayService) {
                logger.log('恢复所有文件显示...');
                this.fileDisplayService.restoreAllDisplayNames();
            }
            
            // 获取并清理编辑器链接装饰器
            try {
                const editorLinkDecorator = this.serviceContainer?.get<IEditorLinkDecorator>(SERVICE_TYPES.EditorLinkDecorator);
                if (editorLinkDecorator) {
                    logger.log('清理编辑器链接装饰器...');
                    editorLinkDecorator.dispose();
                }
            } catch (e) {
                logger.error('清理编辑器链接装饰器时出错:', e);
            }
            
            // 清理扩展缓存
            try {
                const extensionCacheService = this.serviceContainer?.get<ExtensionCacheService>(SERVICE_TYPES.ExtensionCacheService);
                if (extensionCacheService) {
                    logger.log('清理扩展缓存服务...');
                    extensionCacheService.clearCache();
                }
            } catch (e) {
                logger.error('清理扩展缓存服务时出错:', e);
            }
            
            // 清理服务容器
            if (this.serviceContainer) {
                logger.log('清理服务容器...');
                this.serviceContainer.dispose();
                // 创建一个新的空服务容器，使用静态方法获取实例
                this.serviceContainer = ServiceContainer.getInstance();
            }
            
            logger.log('TitleExtractor插件已成功卸载并清理所有资源');
        } catch (error) {
            logger.error('卸载TitleExtractor插件时出错:', error);
            
            // 即使有错误，也尝试清理服务容器
            try {
                if (this.serviceContainer) {
                    this.serviceContainer.dispose();
                    // 创建一个新的空服务容器，使用静态方法获取实例
                    this.serviceContainer = ServiceContainer.getInstance();
                }
            } catch (e) {
                logger.error('清理服务容器时出现二次错误:', e);
            }
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        // 触发设置变更事件，通知扩展缓存服务
        window.dispatchEvent(new CustomEvent('filename-display:settings-changed'));
        
        // 如果服务容器已初始化，刷新编辑器扩展
        if (this.serviceContainer) {
            // 更新编辑器扩展
            this.app.workspace.updateOptions();
            
            // 更新所有文件显示
            this.updateAllFilesDisplay();
        }
    }

    updateAllFilesDisplay(): void {
        if (this.fileDisplayService) {
            this.fileDisplayService.updateAllFilesDisplay();
        }
    }

    registerEditorExtension(extension: Extension[]): void {
        // 首先添加到内部扩展数组
        this.editorExtensions = [...this.editorExtensions, ...extension];
        
        // 添加日志记录
        logger.debug('注册编辑器扩展');
        
        // 然后调用父类方法注册到 Obsidian
        super.registerEditorExtension(extension);
    }

    // 新增：预热缓存方法
    private async warmUpCache(): Promise<void> {
        try {
            // 获取缓存服务
            const fileDisplayCache = this.serviceContainer.get<FileDisplayCache>(SERVICE_TYPES.FileDisplayCache);
            
            // 在应用完全加载后延迟一点时间再执行缓存预热
            // 这有助于确保Obsidian的vault已完全加载所有文件
            logger.log('计划在3秒后开始缓存预热，等待应用完全加载...');
            
            // 使用setTimeout而不是立即执行，给Obsidian时间完成文件加载
            setTimeout(async () => {
                try {
                    // 验证插件仍然活跃（防止在预热开始前插件已被禁用）
                    if (!this.app || !(this as any).enabled) {
                        logger.debug('插件已被禁用，取消缓存预热');
                        return;
                    }
                    
                    // 执行渐进式缓存预热
                    await fileDisplayCache.warmUpCache();
                    logger.log('缓存预热完成');
                } catch (error) {
                    logger.error('延迟执行缓存预热失败:', error);
                }
            }, 3000); // 延迟3秒
            
            logger.log('缓存预热已计划');
        } catch (error) {
            logger.error('安排缓存预热失败:', error);
        }
    }

    // 注册文件事件监听
    private registerEvents(): void {
        // 监听文件修改事件
        this.registerEvent(
            this.app.vault.on('modify', (file: TAbstractFile) => {
                if (file instanceof TFile && file.extension === 'md') {
                    // 当文件内容变更时，交由服务处理
                    this.fileDisplayService.handleFileOperation(file as TFile, 'modify');
                }
            })
        );
        
        // 监听文件创建事件
        this.registerEvent(
            this.app.vault.on('create', (file: TAbstractFile) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.fileDisplayService.handleFileOperation(file as TFile, 'create');
                }
            })
        );
        
        // 监听文件删除事件
        this.registerEvent(
            this.app.vault.on('delete', (file: TAbstractFile) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.fileDisplayService.handleFileOperation(file as TFile, 'delete');
                }
            })
        );
        
        // 监听文件重命名事件
        this.registerEvent(
            this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.fileDisplayService.handleFileOperation(file as TFile, 'rename', oldPath);
                }
            })
        );
        
        // 监听布局变更事件
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                // 重置文件资源管理器观察器
                const fileExplorerDisplayService = this.serviceContainer.get<FileExplorerDisplayService>(SERVICE_TYPES.FileExplorerDisplayService);
                fileExplorerDisplayService.resetObservers();
                
                // 延迟更新所有文件的显示，避免布局更改后立即处理
                setTimeout(() => {
                    this.fileDisplayService.updateAllFilesDisplay(false);
                }, 300);
            })
        );
        
        // 监听缓存清理策略更新事件
        window.addEventListener('filename-display:update-cache-strategy', ((event: CustomEvent) => {
            try {
                const strategy = event.detail.strategy as CacheCleanStrategy;
                const fileDisplayCache = this.serviceContainer.get<FileDisplayCache>(SERVICE_TYPES.FileDisplayCache);
                if (fileDisplayCache) {
                    fileDisplayCache.setCacheCleanStrategy(strategy);
                    logger.log(`已更新缓存清理策略为: ${CacheCleanStrategy[strategy]}`);
                    
                    // 触发一次手动清理，应用新策略
                    fileDisplayCache.triggerCleanup();
                }
            } catch (error) {
                logger.error('更新缓存清理策略失败:', error);
            }
        }) as EventListener);
    }

    /**
     * 设置文件资源管理器
     */
    private setupFileExplorer(): void {
        // 获取文件资源管理器显示服务
        const fileExplorerDisplayService = this.serviceContainer.get<FileExplorerDisplayService>(SERVICE_TYPES.FileExplorerDisplayService);
        
        // 检查文件资源管理器是否已加载
        const checkExplorer = () => {
            const fileExplorers = this.app.workspace.getLeavesOfType('file-explorer');
            if (fileExplorers.length > 0) {
                // 文件资源管理器已加载，设置观察器
                fileExplorerDisplayService.setupObservers();
            } else {
                // 文件资源管理器尚未加载，延迟重试
                setTimeout(checkExplorer, 500);
            }
        };
        
        // 开始检查
        checkExplorer();
    }

    /**
     * 清理所有活跃编辑器中的 CodeMirror 装饰
     * 这确保插件卸载时不会有装饰残留
     */
    private cleanupAllCodeMirrorDecorations(): void {
        logger.log('清理所有CodeMirror装饰...');
        
        try {
            // 迭代所有活跃的MarkdownView
            this.app.workspace.iterateAllLeaves(leaf => {
                if (leaf.view instanceof MarkdownView) {
                    const view = leaf.view;
                    
                    // 使用规范化的方法获取EditorView
                    const editorView = getEditorView(view);
                    
                    if (editorView instanceof EditorView) {
                        // 发送清除所有装饰的效果
                        try {
                            editorView.dispatch({
                                effects: removeLinkDecoration.of(null)
                            });
                            logger.log(`已清理编辑器装饰: ${view.file?.path || 'unknown file'}`);
                        } catch (e) {
                            logger.error(`清理编辑器装饰失败: ${view.file?.path || 'unknown file'}`, e);
                        }
                    }
                }
            });
        } catch (e) {
            logger.error('清理所有CodeMirror装饰时出错:', e);
        }
    }

    /**
     * 按照标准方式注册编辑器扩展
     */
    private registerStandardEditorExtensions() {
        // 创建所有需要的编辑器扩展
        this.editorExtensions = [
            // 从编辑器链接装饰器获取扩展
            ...this.serviceContainer.get<IEditorLinkDecorator>(SERVICE_TYPES.EditorLinkDecorator).getExtension(),
            
            // 添加其他必要的扩展（如视口扩展）
            viewportExtension(),
            incrementalUpdateExtension(),
            editorSyncExtension(this), // 传入插件实例
            
            // 添加组合扩展
            this.createCombinedExtensions()
        ];
        
        // 注册编辑器扩展
        this.registerEditorExtension(this.editorExtensions);
        
        logger.log('已注册标准编辑器扩展');
    }

    /**
     * 创建 CodeMirror 扩展集合
     * 使用扩展缓存服务来优化性能
     */
    private createCombinedExtensions(): Extension {
        return this.extensionCacheService.getCombinedExtensions();
    }
} 