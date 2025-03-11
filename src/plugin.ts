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
import { IFileExplorerDisplayService } from './services/interfaces/IServices';

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
        
        // 从服务容器获取主服务（懒加载）
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
        
        // 监听相关事件
        this.registerEvents();
        
        // 设置文件资源管理器
        this.setupFileExplorer();
        
        // 预热缓存
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
        
        // 注册文件名解析服务（通过工厂函数）
        this.serviceContainer.registerFactory(
            SERVICE_TYPES.FilenameParser, 
            (container) => new FilenameParser(
                this,
                container.get(SERVICE_TYPES.LoggerService)
            )
        );
        
        // 注册文件显示缓存服务（通过工厂函数）
        this.serviceContainer.registerFactory(
            SERVICE_TYPES.FileDisplayCache, 
            (container) => new FileDisplayCache(
                (cleanupFn: () => void) => {
                    const timerService = container.get<TimerService>(SERVICE_TYPES.TimerService);
                    return timerService.setInterval(cleanupFn, 60000); // 每分钟执行一次
                },
                this, // 传入插件实例，使得缓存服务可以访问 app.loadData 和 app.saveData
                container.get(SERVICE_TYPES.LoggerService) // 传入日志服务
            )
        );
        
        // 注册事件管理服务（通过工厂函数）
        this.serviceContainer.registerFactory(
            SERVICE_TYPES.EventManagerService,
            (container) => new EventManagerService(
                this,
                container.get(SERVICE_TYPES.LoggerService)
            )
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
            (container) => new MarkdownLinkService(
                this,
                container.get(SERVICE_TYPES.FilenameParser),
                container.get(SERVICE_TYPES.FileDisplayCache)
            )
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
            
            // 执行渐进式缓存预热
            await fileDisplayCache.warmUpCache();
            
            logger.log('缓存预热启动完成');
        } catch (error) {
            logger.error('缓存预热启动失败:', error);
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
} 