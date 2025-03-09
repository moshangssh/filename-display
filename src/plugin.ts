import { App, Editor, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { FilenameDisplaySettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { FilenameDisplaySettingTab } from './settings/SettingsTab';
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
import { Logger } from './utils/logger';
import { errorHandler } from './utils/ErrorHandler';

const logger = new Logger('FilenameDisplayPlugin');

export default class FilenameDisplayPlugin extends Plugin {
    settings: FilenameDisplaySettings;
    private serviceContainer: ServiceContainer;
    private fileDisplayService: FileDisplayService;

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
        this.addSettingTab(new FilenameDisplaySettingTab(this.app, this));

        // 监听布局变更事件
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                // 重新设置观察器并更新所有文件显示
                this.fileDisplayService.resetObservers();
                this.fileDisplayService.updateAllFilesDisplay();
            })
        );

        // 初始化所有文件的显示
        this.fileDisplayService.updateAllFilesDisplay();
        
        logger.log('Filename Display插件加载完成');
    }
    
    /**
     * 注册所有服务
     */
    private registerServices() {
        // 注册错误处理服务
        this.serviceContainer.register(
            SERVICE_TYPES.ErrorHandler, 
            errorHandler
        );
        
        // 注册定时器服务
        this.serviceContainer.register(
            SERVICE_TYPES.TimerService, 
            new TimerService()
        );
        
        // 注册文件名解析服务
        this.serviceContainer.register(
            SERVICE_TYPES.FilenameParser, 
            new FilenameParser(this)
        );
        
        // 注册文件显示缓存服务
        const cacheService = new FileDisplayCache((cleanupFn: () => void) => {
            const timerService = this.serviceContainer.get<TimerService>(SERVICE_TYPES.TimerService);
            return timerService.setInterval(cleanupFn, 60000); // 每分钟执行一次
        });
        this.serviceContainer.register(
            SERVICE_TYPES.FileDisplayCache, 
            cacheService
        );
        
        // 注册文件处理服务
        const fileProcessorService = new FileProcessorService(
            this,
            this.serviceContainer.get(SERVICE_TYPES.FilenameParser),
            this.serviceContainer.get(SERVICE_TYPES.FileDisplayCache),
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
        
        // 分配事件处理器回调函数
        const handleFileCreate = (file: TFile) => {
            if (this.fileDisplayService) {
                this.fileDisplayService.onFileCreate(file);
            }
        };
        
        const handleFileModify = (file: TFile) => {
            if (this.fileDisplayService) {
                this.fileDisplayService.onFileModify(file);
            }
        };
        
        const handleFileRename = (file: TFile, oldPath: string) => {
            if (this.fileDisplayService) {
                this.fileDisplayService.onFileRename(file, oldPath);
            }
        };
        
        const handleFileDelete = (file: TFile) => {
            if (this.fileDisplayService) {
                this.fileDisplayService.onFileDelete(file);
            }
        };
        
        const handleMetadataChange = (file: TFile) => {
            if (this.fileDisplayService) {
                this.fileDisplayService.onMetadataChange(file);
            }
        };
        
        // 注册事件管理服务
        const eventManagerService = new EventManagerService(
            this,
            handleFileCreate,
            handleFileModify,
            handleFileRename,
            handleFileDelete,
            handleMetadataChange
        );
        this.serviceContainer.register(
            SERVICE_TYPES.EventManagerService, 
            eventManagerService
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
        
        // 最后注册主服务
        const fileDisplayService = new FileDisplayService(this, this.serviceContainer);
        this.serviceContainer.register(
            SERVICE_TYPES.FileDisplayService, 
            fileDisplayService
        );
    }

    onunload() {
        // 恢复所有显示名称并清理资源
        logger.log('卸载Filename Display插件...');
        
        try {
            if (this.serviceContainer) {
                // 清理所有服务
                this.serviceContainer.dispose();
            }
            
            logger.log('Filename Display插件已成功卸载并清理所有资源');
        } catch (error) {
            logger.error('卸载Filename Display插件时出错:', error);
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
} 