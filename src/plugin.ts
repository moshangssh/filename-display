import { App, Editor, MarkdownView, Notice, Plugin, TFile, TAbstractFile } from 'obsidian';
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
import { createEditorExtensions } from './extensions/editor';
import { Logger } from './utils/logger';
import { IEditorLinkDecorator } from './services/interfaces/IServices';

const logger = new Logger('Plugin');

// 创建 CodeMirror 扩展集合
function createCombinedExtensions(plugin: TitleExtractorPlugin): Extension {
    logger.log('创建 CodeMirror 扩展集合');
    
    // 获取服务容器中的服务
    const container = plugin.serviceContainer;
    
    // 收集所有服务的 CodeMirror 扩展
    const extensions: Extension[] = [];
    
    // 添加编辑器链接装饰器服务的扩展
    if (container.has(SERVICE_TYPES.EditorLinkDecorator)) {
        const editorLinkDecorator = container.get<EditorLinkDecorator>(SERVICE_TYPES.EditorLinkDecorator);
        extensions.push(...editorLinkDecorator.getExtension());
    }

    // 添加来自editor.ts的编辑器扩展
    extensions.push(createEditorExtensions(plugin));

    // 如果后续有其他服务提供CodeMirror扩展，可以在这里添加
    
    logger.log(`已收集 ${extensions.length} 个 CodeMirror 扩展`);
    
    return extensions;
}

export default class TitleExtractorPlugin extends Plugin {
    settings: TitleExtractorSettings;
    serviceContainer: ServiceContainer;
    private fileDisplayService: FileDisplayService;
    private editorExtensions: Extension[] = [];

    async onload() {
        await this.loadSettings();
        logger.log('加载插件设置...');
        
        // 初始化服务容器
        this.serviceContainer = ServiceContainer.getInstance(this);
        
        // 注册各个服务
        this.registerServices();
        
        // 从服务容器获取主服务
        this.fileDisplayService = this.serviceContainer.get<FileDisplayService>(SERVICE_TYPES.FileDisplayService);

        // 添加设置标签页
        this.addSettingTab(new TitleExtractorSettingTab(this.app, this));

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
        
        // 监听文件创建、修改、删除和重命名事件
        this.registerEvents();
        
        // 使用懒加载机制初始化文件资源管理器观察器
        this.setupFileExplorer();
        
        // 新增：预热缓存
        await this.warmUpCache();
        
        // 日志输出
        logger.log('插件初始化完成');
    }
    
    /**
     * 注册所有服务
     */
    private registerServices() {
        // 注册日志服务（首先注册，因为其他服务可能依赖它）
        this.serviceContainer.register(
            SERVICE_TYPES.LoggerService, 
            new LoggerService()
        );
        
        // 注册错误处理服务
        this.serviceContainer.register(
            SERVICE_TYPES.ErrorHandler, 
            errorHandler
        );
        
        // 注册定时器服务
        this.serviceContainer.register(
            SERVICE_TYPES.TimerService, 
            new TimerService(this)
        );
        
        // 注册文件名解析服务
        this.serviceContainer.register(
            SERVICE_TYPES.FilenameParser, 
            new FilenameParser(
                this,
                this.serviceContainer.get(SERVICE_TYPES.LoggerService)
            )
        );
        
        // 注册文件显示缓存服务
        const cacheService = new FileDisplayCache(
            (cleanupFn: () => void) => {
                const timerService = this.serviceContainer.get<TimerService>(SERVICE_TYPES.TimerService);
                return timerService.setInterval(cleanupFn, 60000); // 每分钟执行一次
            },
            this // 传入插件实例，使得缓存服务可以访问 app.loadData 和 app.saveData
        );
        this.serviceContainer.register(
            SERVICE_TYPES.FileDisplayCache, 
            cacheService
        );
        
        // 注册文件处理服务
        const fileProcessorService = new FileProcessorService(
            this,
            this.serviceContainer.get(SERVICE_TYPES.FilenameParser),
            this.serviceContainer.get(SERVICE_TYPES.FileDisplayCache),
            this.serviceContainer.get(SERVICE_TYPES.TimerService),
            this.serviceContainer.get(SERVICE_TYPES.LoggerService),
            async (file) => {
                // 在这里，我们还没有FileExplorerDisplayService实例
                // 返回Promise以满足接口要求
                return Promise.resolve();
            }
        );
        this.serviceContainer.register(
            SERVICE_TYPES.FileProcessorService, 
            fileProcessorService
        );
        
        // 注册Markdown链接服务
        const markdownLinkService = new MarkdownLinkService(
            this,
            this.serviceContainer.get(SERVICE_TYPES.FilenameParser),
            this.serviceContainer.get(SERVICE_TYPES.FileDisplayCache)
        );
        this.serviceContainer.register(
            SERVICE_TYPES.MarkdownLinkService, 
            markdownLinkService
        );
        
        // 注册编辑器链接装饰器服务
        const editorLinkDecorator = new EditorLinkDecorator(
            this,
            this.serviceContainer.get(SERVICE_TYPES.FilenameParser),
            this.serviceContainer.get(SERVICE_TYPES.FileDisplayCache)
        );
        this.serviceContainer.register(
            SERVICE_TYPES.EditorLinkDecorator, 
            editorLinkDecorator
        );
        
        // 注册文件资源管理器显示服务
        const fileExplorerDisplayService = new FileExplorerDisplayService(
            this,
            this.serviceContainer.get(SERVICE_TYPES.FilenameParser),
            this.serviceContainer.get(SERVICE_TYPES.FileDisplayCache),
            () => {
                if (this.fileDisplayService) {
                    this.fileDisplayService.updateAllFilesDisplay();
                }
            },
            async (file) => {
                if (this.fileDisplayService) {
                    return this.fileDisplayService.updateFileExplorerDisplay(file);
                }
                return Promise.resolve();
            },
            (nodes) => {
                if (fileExplorerDisplayService) {
                    fileExplorerDisplayService.updateAddedNodes(nodes);
                }
            }
        );
        this.serviceContainer.register(
            SERVICE_TYPES.FileExplorerDisplayService, 
            fileExplorerDisplayService
        );

        // 创建事件管理服务
        const eventManagerService = new EventManagerService(
            this,
            this.serviceContainer.get(SERVICE_TYPES.LoggerService)
        );
        this.serviceContainer.register(
            SERVICE_TYPES.EventManagerService,
            eventManagerService
        );
        
        // 注册主服务
        const fileDisplayService = new FileDisplayService(
            this,
            this.serviceContainer.get(SERVICE_TYPES.FilenameParser),
            this.serviceContainer.get(SERVICE_TYPES.FileDisplayCache),
            this.serviceContainer.get(SERVICE_TYPES.FileExplorerDisplayService),
            this.serviceContainer.get(SERVICE_TYPES.FileProcessorService),
            this.serviceContainer.get(SERVICE_TYPES.MarkdownLinkService),
            this.serviceContainer.get(SERVICE_TYPES.EditorLinkDecorator),
            this.serviceContainer.get(SERVICE_TYPES.EventManagerService),
            this.serviceContainer.get(SERVICE_TYPES.TimerService),
            this.serviceContainer.get(SERVICE_TYPES.LoggerService)
        );
        this.serviceContainer.register(
            SERVICE_TYPES.FileDisplayService, 
            fileDisplayService
        );
        
        // 设置事件监听器
        eventManagerService.setupVaultEventListeners();
        eventManagerService.setupMetadataEventListeners();
    }

    onunload() {
        // 恢复所有显示名称并清理资源
        logger.log('卸载TitleExtrator插件...');
        
        try {
            if (this.serviceContainer) {
                // 清理所有服务
                this.serviceContainer.dispose();
            }
            
            logger.log('TitleExtrator插件已成功卸载并清理所有资源');
        } catch (error) {
            logger.error('卸载TitleExtrator插件时出错:', error);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    updateAllFilesDisplay(): void {
        if (this.fileDisplayService) {
            this.fileDisplayService.updateAllFilesDisplay();
        }
    }

    registerEditorExtension(extension: Extension[]): void {
        // 首先添加到内部扩展数组
        this.editorExtensions = [...this.editorExtensions, ...extension];
        
        // 然后调用父类方法注册到 Obsidian
        super.registerEditorExtension(extension);
    }

    // 新增：预热缓存方法
    private async warmUpCache(): Promise<void> {
        try {
            // 获取缓存服务
            const fileDisplayCache = this.serviceContainer.get<FileDisplayCache>(SERVICE_TYPES.FileDisplayCache);
            
            // 执行缓存预热
            await fileDisplayCache.warmUpCache();
            
            logger.log('缓存预热完成');
        } catch (error) {
            logger.error('缓存预热失败:', error);
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
    }

    /**
     * 使用懒加载机制设置文件资源管理器
     * 延迟初始化文件资源管理器的观察器，直到文件资源管理器完全加载
     */
    private setupFileExplorer(): void {
        logger.log('开始懒加载文件资源管理器...');
        
        // 尝试次数计数器
        let attempts = 0;
        const maxAttempts = 50; // 最多尝试50次，约5秒
        
        // 确保文件资源管理器已加载
        const checkExplorer = () => {
            attempts++;
            const fileExplorers = this.app.workspace.getLeavesOfType('file-explorer');
            
            if (fileExplorers.length > 0) {
                logger.log(`文件资源管理器已加载，尝试次数: ${attempts}`);
                
                // 文件资源管理器已加载，初始化观察器
                const fileExplorerService = this.serviceContainer.get<FileExplorerDisplayService>(SERVICE_TYPES.FileExplorerDisplayService);
                fileExplorerService.setupObservers();
                
                // 更新所有文件显示
                logger.log('开始更新所有文件显示...');
                this.fileDisplayService.updateAllFilesDisplay(false);
            } else {
                if (attempts >= maxAttempts) {
                    logger.log('达到最大尝试次数，可能文件资源管理器未加载');
                    return;
                }
                
                // 继续等待，使用指数退避策略
                const delay = Math.min(100 * Math.pow(1.1, attempts), 500);
                logger.log(`文件资源管理器尚未加载，${delay}ms后重试 (${attempts}/${maxAttempts})`);
                setTimeout(checkExplorer, delay);
            }
        };
        
        // 开始检查
        checkExplorer();
    }
} 