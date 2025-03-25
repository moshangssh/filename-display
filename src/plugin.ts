import { App, Editor, MarkdownView, Notice, Plugin, TFile, TAbstractFile, editorViewField } from 'obsidian';
import { TitleExtractorSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { TitleExtractorSettingTab } from './settings/SettingsTab';
import { FileDisplayService } from './services/FileDisplayService';
import { FilenameParser } from './services/FilenameParser';
import { FileDisplayCache } from './services/cache/FileDisplayCache';
import { FileExplorerDisplayService } from './services/FileExplorerDisplayService';
import { FileProcessorService } from './services/FileProcessorService';
import { MarkdownLinkService } from './services/MarkdownLinkService';
import { EventManagerService } from './services/EventManagerService';
import { EditorLinkDecorator } from './services/EditorLinkDecorator';
import { TimerService } from './services/TimerService';
import { LoggerService } from './services/LoggerService';
import { errorHandler } from './utils/ErrorHandler';
import { Extension, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { IEditorLinkDecorator, IFileExplorerDisplayService, CacheCleanStrategy, IFileDisplayCache, IPerformanceMonitor } from './services/interfaces/IServices';
import { ExtensionCacheService } from './services/ExtensionCacheService';
import { getEditorView } from './utils/editor-utils';
import { 
    viewportExtension, 
    incrementalUpdateExtension, 
    editorSyncExtension,
    removeLinkDecoration
} from './extensions';
import { LinkStateManager } from './services/LinkStateManager';
import { FileDisplayCacheFactory } from './services/cache/FileDisplayCacheFactory';
import { ServiceContainer } from './core/ServiceContainer';
import { FileProcessor } from './utils/FileProcessor';
import { PerformanceMonitor } from './services/PerformanceMonitor';
import { CacheManager } from './services/cache/CacheManager';
import { ErrorHandler } from './services/ErrorHandler';
import { DependencyTracker } from './utils/DependencyTracker';
import { EventBus } from './core/events/EventBus';

const logger = new LoggerService('Plugin');

// 定义扩展分组类型
const EXTENSION_GROUPS = {
    CORE: 'core',       // 核心扩展（视口、增量更新等）
    LINK: 'link',       // 链接相关扩展
    CUSTOM: 'custom'    // 自定义扩展
};

export default class TitleExtractorPlugin extends Plugin {
    settings: TitleExtractorSettings;
    
    // 服务容器实例
    serviceContainer: ServiceContainer = ServiceContainer.getInstance();
    
    // 服务实例
    private fileDisplayService: FileDisplayService;
    
    // 编辑器扩展相关
    private editorExtensions: Extension[] = [];
    
    // 使用Compartment管理扩展分组
    private extensionCompartments: Map<string, Compartment> = new Map();
    
    // 核心服务组件
    filenameParser: FilenameParser;
    fileDisplayCache: IFileDisplayCache;
    fileProcessorService: FileProcessorService;
    markdownLinkService: MarkdownLinkService;
    eventManager: EventManagerService;
    loggerService: LoggerService;
    timerService: TimerService;
    linkStateManager: LinkStateManager;
    fileExplorerDisplayService: FileExplorerDisplayService;
    editorLinkDecorator: EditorLinkDecorator;
    extensionCacheService: ExtensionCacheService;

    async onload() {
        await this.loadSettings();
        logger.log('加载插件设置...');

        // 添加设置选项卡
        this.addSettingTab(new TitleExtractorSettingTab(this.app, this));

        try {
            // 处理缓存迁移
            await this.handleCacheMigration();
            
            // 初始化扩展管理
            this.initExtensionCompartments();
            
            // 直接初始化所有服务
            this.initServices();
            
            // 设置文件浏览器
            this.setupFileExplorer();
            
            // 注册编辑器扩展
            this.registerStandardEditorExtensions();
            
            // 预热缓存
            await this.warmUpCache();
            
            // 注册事件监听
            this.registerEvents();
            
            // 记录依赖关系
            DependencyTracker.logDependencies();
            
            logger.log('插件加载完成');
        } catch (error) {
            logger.error('插件加载时发生错误:', error);
            new Notice('TitleExtractor插件加载失败');
        }
    }
    
    /**
     * 初始化扩展分组的Compartment
     */
    private initExtensionCompartments(): void {
        // 为每个扩展分组创建一个Compartment
        Object.values(EXTENSION_GROUPS).forEach(group => {
            this.extensionCompartments.set(group, new Compartment());
        });
        
        logger.debug('已初始化扩展分组Compartments');
    }
    
    /**
     * 初始化服务
     */
    private initServices(): void {
        // 初始化服务容器
        this.serviceContainer.clear(); // 清空容器，防止多次初始化
        
        // 初始化基础服务
        this.loggerService = new LoggerService();
        this.timerService = new TimerService(this);
        
        // 初始化性能监控和错误处理服务
        const performanceMonitor = PerformanceMonitor.getInstance(this.loggerService);
        performanceMonitor.enable(this.settings.performanceThreshold || 50);
        
        const errorHandler = ErrorHandler.getInstance(this.loggerService);
        
        // 初始化中心化缓存管理
        const cacheManager = CacheManager.getInstance(this.loggerService);
        
        // 将基础服务注册到容器
        this.serviceContainer.register('plugin', this);
        this.serviceContainer.register('loggerService', this.loggerService);
        this.serviceContainer.register('timerService', this.timerService);
        this.serviceContainer.register('performanceMonitor', performanceMonitor);
        this.serviceContainer.register('errorHandler', errorHandler);
        this.serviceContainer.register('cacheManager', cacheManager);
        
        // 初始化文件名解析器
        this.filenameParser = new FilenameParser(this, this.loggerService);
        this.serviceContainer.register('filenameParser', this.filenameParser);
        
        // 创建文件更新函数
        const updateFileFn = async (file: TFile) => {
            return this.fileExplorerDisplayService?.updateFileExplorerDisplay(file);
        };
        
        // 初始化文件处理服务 - 不传递缓存服务
        this.fileProcessorService = new FileProcessorService(
            this,
            this.filenameParser,
            undefined, // 暂时不传入缓存
            this.loggerService,
            this.timerService,
            performanceMonitor,
            errorHandler
        );
        
        // 初始化文件显示缓存 - 使用工厂模式创建，不传入处理服务（避免循环依赖）
        this.fileDisplayCache = FileDisplayCacheFactory.createFileDisplayCache(
            this,
            this.loggerService,
            this.timerService
            // 不传入 fileProcessorService，避免循环依赖
        );
        
        // 设置文件处理服务的缓存依赖
        this.fileProcessorService.setFileDisplayCache(this.fileDisplayCache);
        
        // 设置文件处理服务的更新函数
        this.fileProcessorService.setUpdateFileDisplayFn(updateFileFn);
        
        // 注册缓存服务
        this.serviceContainer.register('fileDisplayCache', this.fileDisplayCache);
        
        // 注册文件处理服务
        this.serviceContainer.register('fileProcessorService', this.fileProcessorService);
        
        // 注册通用文件处理工具
        const fileProcessor = new FileProcessor(
            this,
            this.filenameParser,
            this.fileDisplayCache,
            this.loggerService
        );
        this.serviceContainer.register('fileProcessor', fileProcessor);
        
        // 初始化事件管理服务
        this.eventManager = new EventManagerService(this, this.loggerService);
        this.eventManager.setupVaultEventListeners();
        this.eventManager.setupMetadataEventListeners();
        this.serviceContainer.register('eventManager', this.eventManager);
        
        // 初始化链接状态管理器
        this.linkStateManager = new LinkStateManager(this);
        // 注册链接状态管理器到容器
        this.serviceContainer.register('linkStateManager', this.linkStateManager);
        
        // 初始化扩展缓存服务
        this.extensionCacheService = new ExtensionCacheService(this);
        this.serviceContainer.register('extensionCacheService', this.extensionCacheService);
        
        // 初始化文件浏览器显示服务
        this.fileExplorerDisplayService = FileExplorerDisplayService.create(this);
        this.serviceContainer.register('fileExplorerDisplayService', this.fileExplorerDisplayService);
        
        // 初始化Markdown链接服务
        this.markdownLinkService = MarkdownLinkService.create(this);
        this.serviceContainer.register('markdownLinkService', this.markdownLinkService);
        
        // 初始化编辑器链接装饰器
        if (this.settings.enableEditorLinkDecorations) {
            this.editorLinkDecorator = EditorLinkDecorator.create(this);
            this.serviceContainer.register('editorLinkDecorator', this.editorLinkDecorator);
        }
        
        // 初始化文件显示服务
        this.fileDisplayService = FileDisplayService.create(this);
        this.serviceContainer.register('fileDisplayService', this.fileDisplayService);
    }

    onunload() {
        // 恢复所有显示名称并清理资源
        logger.log('卸载TitleExtractor插件...');
        
        try {
            // 取消任何正在进行的缓存预热
            try {
                const fileDisplayCache = this.fileDisplayCache;
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
            
            // 显式卸载编辑器扩展 - 使用Compartment进行清理
            try {
                logger.log('清理编辑器扩展Compartments...');
                
                // 清理每个Compartment
                this.extensionCompartments.forEach((compartment, groupName) => {
                    try {
                        // 使用空数组替换compartment内容，有效清除其中的扩展
                        super.registerEditorExtension(compartment.of([]));
                        logger.debug(`清理扩展分组: ${groupName}`);
                    } catch (e) {
                        logger.error(`清理扩展分组${groupName}时出错:`, e);
                    }
                });
                
                // 清空本地扩展集合
                this.editorExtensions = [];
                
                // 更新编辑器选项，强制应用变更
                this.app.workspace.updateOptions();
                logger.log('已清理所有编辑器扩展');
            } catch (e) {
                logger.error('清理编辑器扩展时出错:', e);
            }
            
            // 恢复所有文件显示（必要的自定义清理）
            if (this.fileDisplayService) {
                logger.log('恢复所有文件显示...');
                this.fileDisplayService.restoreAllDisplayNames();
            }
            
            // 获取并清理编辑器链接装饰器
            try {
                if (this.editorLinkDecorator) {
                    logger.log('清理编辑器链接装饰器...');
                    this.editorLinkDecorator.dispose();
                }
            } catch (e) {
                logger.error('清理编辑器链接装饰器时出错:', e);
            }
            
            // 清理扩展缓存
            try {
                if (this.extensionCacheService) {
                    logger.log('清理扩展缓存服务...');
                    this.extensionCacheService.clearCache();
                }
            } catch (e) {
                logger.error('清理扩展缓存服务时出错:', e);
            }
            
            // 清理所有服务资源
            this.cleanupServices();
            
            logger.log('TitleExtractor插件已成功卸载并清理所有资源');
        } catch (error) {
            logger.error('卸载TitleExtractor插件时出错:', error);
            
            // 即使有错误，也尝试清理服务资源
            this.cleanupServices();
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        // 触发设置变更事件，通知扩展缓存服务
        window.dispatchEvent(new CustomEvent('filename-display:settings-changed'));
        
        // 如果服务已初始化，刷新编辑器扩展
        if (this.fileDisplayService) {
            // 更新编辑器扩展
            this.app.workspace.updateOptions();
            
            // 更新所有文件显示
            this.fileDisplayService.updateAllFilesDisplay();
        }
    }

    updateAllFilesDisplay(): void {
        if (this.fileDisplayService) {
            this.fileDisplayService.updateAllFilesDisplay();
        }
    }

    /**
     * 注册编辑器扩展
     * 根据扩展类型自动分组到对应的Compartment
     */
    registerEditorExtension(extension: Extension[], groupName: string = EXTENSION_GROUPS.CUSTOM): void {
        logger.debug(`注册编辑器扩展到 ${groupName} 分组`);
        
        // 检查分组是否存在
        if (!this.extensionCompartments.has(groupName)) {
            logger.warn(`未找到扩展分组 ${groupName}，创建新分组`);
            this.extensionCompartments.set(groupName, new Compartment());
        }
        
        // 获取分组的Compartment
        const compartment = this.extensionCompartments.get(groupName);
        
        // 更新本地扩展集合以跟踪所有扩展
        this.editorExtensions = [...this.editorExtensions, ...extension];
        
        // 使用Compartment更新扩展
        this.updateCompartment(compartment!, extension);
    }
    
    /**
     * 使用Compartment更新扩展
     * 这会触发CodeMirror的重新配置，但只影响特定分组
     */
    private updateCompartment(compartment: Compartment, extension: Extension): void {
        try {
            // 检查扩展是否已经注册过，避免重复注册
            const extensionSignature = this.getExtensionSignature(extension);
            const alreadyRegistered = this.editorExtensions.some(ext => 
                this.getExtensionSignature(ext) === extensionSignature && extensionSignature !== ''
            );
            
            if (alreadyRegistered) {
                logger.debug('扩展已存在，跳过重复注册');
                return;
            }
            
            // 防止Compartment冲突
            super.registerEditorExtension(compartment.of(extension));
            logger.debug('成功通过Compartment注册扩展');
        } catch (error) {
            logger.error('更新扩展Compartment时出错：', error);
            
            // 尝试使用新的Compartment重新注册
            try {
                // 创建新的Compartment
                const newCompartment = new Compartment();
                
                // 找到当前Compartment的分组名称并更新
                for (const [key, value] of this.extensionCompartments.entries()) {
                    if (value === compartment) {
                        this.extensionCompartments.set(key, newCompartment);
                        break;
                    }
                }
                
                // 使用新Compartment注册
                super.registerEditorExtension(newCompartment.of(extension));
                logger.debug('使用新Compartment重新注册成功');
            } catch (retryError) {
                logger.error('重试注册失败，回退到标准注册方法:', retryError);
                
                // 最终回退到标准注册方法
                try {
                    super.registerEditorExtension(extension);
                    logger.debug('已回退到标准注册方法');
                } catch (finalError) {
                    logger.error('所有注册方法都失败，放弃注册此扩展', finalError);
                }
            }
        }
    }

    /**
     * 获取扩展的唯一签名，用于检测重复
     * 注意：这只是一个简单的启发式方法，无法保证100%准确
     */
    private getExtensionSignature(extension: Extension): string {
        try {
            // 尝试获取对象的字符串表示
            const str = extension.toString();
            
            // 如果是EditorView的方法，提取其名称
            if (str.includes('EditorView')) {
                const match = /EditorView\.([a-zA-Z]+)/.exec(str);
                return match ? `EditorView.${match[1]}` : str.substring(0, 50);
            }
            
            return str.substring(0, 50); // 取前50个字符作为签名
        } catch (e) {
            return ''; // 无法获取签名
        }
    }

    // 新增：预热缓存方法
    private async warmUpCache(): Promise<void> {
        logger.log('正在预热缓存...');
        
        // 让系统和插件先初始化完成
        await this.wait(1000);
        
        try {
            // 先处理所有可见文件
            const files = this.app.vault.getMarkdownFiles().filter(file => 
                this.filenameParser.isFileInEnabledFolder(file)
            );
            
            // 获取当前活跃文件
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile && activeFile.extension === 'md') {
                logger.info('预热缓存: 处理当前活跃文件');
                
                // 使用 processFileWrapper 而不是 processFile
                await this.fileProcessorService.processFileWrapper(activeFile);
            }
            
            // 预热缓存
            logger.log(`预热缓存: 启动缓存预热器处理 ${files.length} 个文件`);
            await this.fileDisplayCache.warmUpCache();
        } catch (error) {
            logger.error('预热缓存时出错:', error);
        }
    }

    /**
     * 注册事件监听
     */
    private registerEvents(): void {
        // 添加设置变更事件处理
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    menu.addItem((item) => {
                        item
                            .setTitle('刷新显示标题')
                            .setIcon('refresh-cw')
                            .onClick(async () => {
                                await this.fileProcessorService.processFile(file);
                                if (this.fileExplorerDisplayService) {
                                    await this.fileExplorerDisplayService.updateFileExplorerDisplay(file);
                                }
                            });
                    });
                }
            })
        );
        
        // 注册文件事件
        this.registerFileEvents();
        
        // 使用EventBus注册缓存未命中事件处理
        const eventBus = EventBus.getInstance();
        eventBus.subscribe('cache:miss', async (file: TFile) => {
            this.loggerService.debug(`响应 cache:miss 事件：处理文件 ${file.path}`);
            try {
                // 使用 processFileWrapper 而不是 processFile
                const result = await this.fileProcessorService.processFileWrapper(file);
                if (result && result.success && this.fileExplorerDisplayService) {
                    await this.fileExplorerDisplayService.updateFileExplorerDisplay(file);
                }
            } catch (error: unknown) {
                this.loggerService.error(`处理文件 ${file.path} 时出错:`, error);
            }
        });
        
        // 添加命令: 重新处理所有文件
        this.addCommand({
            id: 'refresh-all-files',
            name: '重新处理所有文件',
            callback: () => {
                this.updateAllFilesDisplay();
            },
        });
        
        // 添加命令: 清除缓存
        this.addCommand({
            id: 'clear-display-cache',
            name: '清除文件显示缓存',
            callback: () => {
                this.fileDisplayCache.clearAll();
                new Notice('已清除文件显示缓存');
            },
        });
    }
    
    /**
     * 注册文件相关事件
     */
    private registerFileEvents(): void {
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
                const fileExplorerDisplayService = this.fileExplorerDisplayService;
                fileExplorerDisplayService.resetObservers();
                
                // 延迟更新所有文件的显示，避免布局更改后立即处理
                setTimeout(() => {
                    this.fileDisplayService.updateAllFilesDisplay(false);
                }, 300);
            })
        );
    }

    /**
     * 设置文件资源管理器
     */
    private setupFileExplorer(): void {
        // 获取文件资源管理器显示服务
        const fileExplorerDisplayService = this.fileExplorerDisplayService;
        
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
     * 注册标准编辑器扩展
     * 一次性注册所有扩展，避免在运行时修改
     */
    private registerStandardEditorExtensions() {
        try {
            // 创建核心扩展分组的Compartment
            if (!this.extensionCompartments.has(EXTENSION_GROUPS.CORE)) {
                this.extensionCompartments.set(EXTENSION_GROUPS.CORE, new Compartment());
            }
            
            // 创建链接扩展分组的Compartment
            if (!this.extensionCompartments.has(EXTENSION_GROUPS.LINK)) {
                this.extensionCompartments.set(EXTENSION_GROUPS.LINK, new Compartment());
            }
            
            // 创建自定义扩展分组的Compartment
            if (!this.extensionCompartments.has(EXTENSION_GROUPS.CUSTOM)) {
                this.extensionCompartments.set(EXTENSION_GROUPS.CUSTOM, new Compartment());
            }
            
            // 获取各分组的Compartment
            const coreCompartment = this.extensionCompartments.get(EXTENSION_GROUPS.CORE)!;
            const linkCompartment = this.extensionCompartments.get(EXTENSION_GROUPS.LINK)!;
            
            // 构建核心扩展数组 - 注意调用函数获取真正的扩展实例
            const coreExtensions: Extension[] = [
                viewportExtension(),
                incrementalUpdateExtension(),
                editorSyncExtension(this)
            ];
            
            // 注册核心扩展
            super.registerEditorExtension(coreCompartment.of(coreExtensions));
            logger.debug('成功注册核心编辑器扩展');
            
            // 当启用了编辑器链接装饰时，注册链接扩展
            if (this.settings.enableEditorLinkDecorations) {
                // 获取链接装饰器扩展
                if (!this.editorLinkDecorator) {
                    logger.error('找不到EditorLinkDecorator实例，跳过链接扩展注册');
                    return;
                }
                
                const linkExtensions = this.editorLinkDecorator.getExtension();
                
                // 一次性注册所有链接扩展
                super.registerEditorExtension(linkCompartment.of(linkExtensions));
                logger.debug('成功注册链接编辑器扩展');
            } else {
                logger.debug('链接装饰已禁用，跳过注册链接扩展');
                
                // 注册一个空扩展以保持Compartment结构
                super.registerEditorExtension(linkCompartment.of([]));
            }
        } catch (error) {
            logger.error('注册标准编辑器扩展时出错:', error);
            
            // 出错时使用最简单的方式注册核心扩展
            try {
                super.registerEditorExtension([
                    viewportExtension(),
                    incrementalUpdateExtension(),
                    editorSyncExtension(this)
                ]);
                logger.debug('已使用简单方式注册核心扩展');
            } catch (fallbackError) {
                logger.error('注册核心扩展失败，编辑器功能可能受到影响:', fallbackError);
            }
        }
    }

    /**
     * 清理所有服务资源
     */
    private cleanupServices(): void {
        try {
            // 按照依赖顺序逐个清理
            if (this.fileDisplayService && typeof this.fileDisplayService.dispose === 'function') {
                this.fileDisplayService.dispose();
            }
            
            if (this.editorLinkDecorator && typeof this.editorLinkDecorator.dispose === 'function') {
                this.editorLinkDecorator.dispose();
            }
            
            // 移除不支持dispose方法的服务检查
            
            if (this.fileExplorerDisplayService && typeof this.fileExplorerDisplayService.dispose === 'function') {
                this.fileExplorerDisplayService.dispose();
            }
            
            if (this.fileDisplayCache && typeof this.fileDisplayCache.dispose === 'function') {
                this.fileDisplayCache.dispose();
            }
            
            if (this.filenameParser && typeof this.filenameParser.dispose === 'function') {
                this.filenameParser.dispose();
            }
            
            if (this.eventManager && typeof this.eventManager.dispose === 'function') {
                this.eventManager.dispose();
            }
            
            if (this.timerService && typeof this.timerService.dispose === 'function') {
                this.timerService.dispose();
            }
            
            if (this.loggerService && typeof this.loggerService.dispose === 'function') {
                this.loggerService.dispose();
            }
            
            if (this.extensionCacheService && typeof this.extensionCacheService.dispose === 'function') {
                this.extensionCacheService.dispose();
            }
            
            if (this.linkStateManager && typeof this.linkStateManager.dispose === 'function') {
                this.linkStateManager.dispose();
            }
        } catch (error) {
            console.error('清理服务时出错:', error);
        }
    }

    /**
     * 处理缓存迁移
     * 检查是否需要清除旧版本的缓存数据
     */
    private async handleCacheMigration(): Promise<void> {
        try {
            // 检查是否存在迁移标志
            const migrationFlag = this.settings.cacheMigrationV1;
            
            // 如果没有迁移过，执行迁移
            if (!migrationFlag) {
                logger.info('检测到首次重构后启动，清除旧缓存数据');
                
                // 尝试清除旧缓存
                try {
                    await this.saveData(null);
                    logger.info('旧缓存数据已清除');
                } catch (e) {
                    logger.warn('清除旧缓存失败:', e);
                }
                
                // 设置迁移标志
                this.settings.cacheMigrationV1 = true;
                await this.saveSettings();
            }
        } catch (error) {
            logger.warn('缓存迁移检查失败:', error);
        }
    }

    /**
     * 等待指定的毫秒数
     * @param ms 等待的毫秒数
     * @returns Promise，在指定毫秒数后解析
     */
    private wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
} 