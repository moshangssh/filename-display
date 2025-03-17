import { TFile } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { IFilenameParser, IFileDisplayCache, IFileExplorerDisplayService, IEventManagerService, ILoggerService } from './interfaces/IServices';
import { FileExplorerObserver } from './FileExplorerObserver';
import { FileEventType, FileEvent } from './EventManagerService';
import { DisplayUpdateHelper } from './helpers/DisplayUpdateHelper';

export class FileExplorerDisplayService implements IFileExplorerDisplayService {
    private plugin: ITitleExtractorPlugin;
    private filenameParser: IFilenameParser;
    private fileDisplayCache: IFileDisplayCache;
    private fileExplorerObserver: FileExplorerObserver;
    private eventManager: IEventManagerService;
    private logger: ILoggerService;
    private unsubscribers: (() => void)[] = [];
    private displayHelper: DisplayUpdateHelper;

    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: IFilenameParser,
        fileDisplayCache: IFileDisplayCache,
        eventManager: IEventManagerService,
        loggerService: ILoggerService
    ) {
        this.plugin = plugin;
        this.filenameParser = filenameParser;
        this.fileDisplayCache = fileDisplayCache;
        this.eventManager = eventManager;
        this.logger = loggerService.getLogger('FileExplorerDisplayService');
        
        // 初始化显示更新辅助类
        this.displayHelper = new DisplayUpdateHelper(
            plugin,
            filenameParser,
            fileDisplayCache,
            loggerService
        );
        
        // 初始化文件资源管理器观察器
        this.fileExplorerObserver = new FileExplorerObserver(
            plugin,
            // 更新所有文件的回调
            () => {
                this.dispatchUpdateAllFilesEvent();
            },
            // 更新单个文件的回调
            async (file: TFile) => {
                return this.updateFileExplorerDisplay(file);
            },
            // 更新新添加节点的回调
            (nodes: Node[]) => {
                this.updateAddedNodes(nodes);
            }
        );
        
        this.logger.info('FileExplorerDisplayService 初始化完成');
    }
    
    // 分发更新所有文件的事件
    private dispatchUpdateAllFilesEvent(): void {
        const event: FileEvent = {
            type: FileEventType.UPDATE_ALL,
            file: null as any, // 此事件不关联特定文件
            source: 'FileExplorerDisplayService'
        };
        this.eventManager.dispatch(event).catch(err => {
            this.logger.error('分发更新所有文件事件失败', err);
        });
    }

    // 更新新添加的节点
    public updateAddedNodes(nodes: Node[]): void {
        const fileItems = nodes.filter(node => {
            if (node instanceof HTMLElement) {
                return node.classList.contains('nav-file-title') || 
                      node.querySelector('.nav-file-title') !== null;
            }
            return false;
        }) as HTMLElement[];
        
        for (const item of fileItems) {
            const fileEl = item.classList.contains('nav-file-title') ? 
                            item : item.querySelector('.nav-file-title');
            if (fileEl) {
                const path = fileEl.getAttribute('data-path');
                if (path) {
                    const file = this.plugin.app.vault.getAbstractFileByPath(path);
                    if (file instanceof TFile) {
                        // 先检查缓存，如果有缓存直接应用，避免文件名闪烁
                        const titleEl = fileEl.querySelector('.nav-file-title-content') as HTMLElement;
                        if (titleEl) {
                            // getDisplayName 现在会进行缓存一致性检查
                            const cachedDisplayName = this.fileDisplayCache.getDisplayName(path);
                            if (cachedDisplayName) {
                                // 如果有有效缓存，立即应用
                                const originalName = titleEl.textContent || file.basename;
                                this.fileDisplayCache.saveOriginalName(path, originalName);
                                this.fileDisplayCache.saveElementData(titleEl, path, originalName);
                                titleEl.textContent = cachedDisplayName;
                            } else {
                                // 否则需要重新处理文件
                                this.displayHelper.updateFileElement(titleEl, file);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // 更新文件元素显示
    public updateFileElement(titleEl: HTMLElement, file: TFile): void {
        this.displayHelper.updateFileElement(titleEl, file);
    }
    
    // 恢复单个元素的显示名称
    public restoreDisplayName(titleEl: HTMLElement): void {
        this.displayHelper.restoreDisplayName(titleEl);
    }
    
    // 设置文件资源管理器观察器
    public setupObservers(): void {
        this.logger.log('设置文件资源管理器观察器...');
        this.fileExplorerObserver.setupObservers();
    }
    
    // 重置文件资源管理器观察器
    public resetObservers(): void {
        this.logger.log('重置文件资源管理器观察器...');
        this.fileExplorerObserver.stopObserving();
        this.fileExplorerObserver.setupObservers();
    }
    
    // 更新文件资源管理器中的文件显示
    public async updateFileExplorerDisplay(file: TFile): Promise<void> {
        try {
            if (!file) {
                return;
            }
            
            // 查找文件资源管理器中的文件元素
            const fileItems = document.querySelectorAll('.nav-file-title[data-path="' + file.path + '"]');
            if (fileItems.length === 0) {
                return;
            }
            
            for (let i = 0; i < fileItems.length; i++) {
                const fileItem = fileItems[i] as HTMLElement;
                const titleEl = fileItem.querySelector('.nav-file-title-content') as HTMLElement;
                if (titleEl) {
                    this.updateFileElement(titleEl, file);
                }
            }
        } catch (error) {
            this.logger.error(`更新文件 ${file.path} 的显示时出错:`, error);
        }
    }
    
    // 恢复所有文件的显示名称
    public restoreAllDisplayNames(): void {
        try {
            this.logger.log('恢复所有文件的显示名称...');
            
            // 获取所有文件标题元素
            const fileItems = document.querySelectorAll('.nav-file-title-content');
            
            for (let i = 0; i < fileItems.length; i++) {
                const titleEl = fileItems[i] as HTMLElement;
                this.restoreDisplayName(titleEl);
            }
            
            this.logger.log('所有文件的显示名称已恢复');
        } catch (error) {
            this.logger.error('恢复所有文件的显示名称时出错:', error);
        }
    }
    
    // 处理文件以获取显示名称
    private processFile(file: TFile): FileDisplayResult {
        return this.displayHelper.processFile(file);
    }
    
    /**
     * 释放资源
     */
    public dispose(): void {
        this.logger.log('释放 FileExplorerDisplayService 资源...');
        
        // 取消所有事件订阅
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        
        // 停止观察器
        if (this.fileExplorerObserver) {
            this.fileExplorerObserver.stopObserving();
        }
        
        // 恢复所有显示名称
        this.restoreAllDisplayNames();
        
        this.logger.log('FileExplorerDisplayService 资源已释放');
    }
} 