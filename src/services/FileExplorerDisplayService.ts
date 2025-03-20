import { TFile, WorkspaceLeaf } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { IFilenameParser, IFileDisplayCache, IFileExplorerDisplayService, IEventManagerService, ILoggerService } from './interfaces/IServices';
import { FileEventType, FileEvent } from './EventManagerService';

export class FileExplorerDisplayService implements IFileExplorerDisplayService {
    private plugin: ITitleExtractorPlugin;
    private filenameParser: IFilenameParser;
    private fileDisplayCache: IFileDisplayCache;
    private eventManager: IEventManagerService;
    private logger: ILoggerService;
    private unsubscribers: (() => void)[] = [];
    
    // 从 FileExplorerObserver 合并的属性
    private fileExplorerObserver: MutationObserver | null = null;
    private folderObserver: MutationObserver | null = null;

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
                                this.updateFileElement(titleEl, file);
                            }
                        }
                    }
                }
            }
        }
    }
    
    /**
     * 处理文件以获取显示名称
     * @param file 要处理的文件
     * @returns 文件处理结果
     */
    private processFile(file: TFile): FileDisplayResult {
        // 检查文件是否在启用的文件夹中
        if (!this.filenameParser.isFileInEnabledFolder(file)) {
            return {
                success: false,
                error: '文件不在启用的文件夹中',
                displayName: file.basename
            };
        }

        // 检查缓存
        if (this.fileDisplayCache.hasDisplayName(file.path)) {
            const cachedName = this.fileDisplayCache.getDisplayName(file.path);
            if (cachedName) {
                return {
                    success: true,
                    displayName: cachedName,
                    fromCache: true
                };
            }
        }

        // 使用FilenameParser处理文件
        const result = this.filenameParser.getDisplayNameFromMetadata(file);
        if (result.success && result.displayName) {
            this.fileDisplayCache.setDisplayName(file.path, result.displayName);
        }
        return result;
    }

    /**
     * 应用显示名称到HTML元素
     * @param titleEl 标题元素
     * @param file 文件对象
     * @param result 处理结果
     */
    private applyDisplayNameToElement(titleEl: HTMLElement, file: TFile, result: FileDisplayResult): void {
        if (!result.success || !result.displayName) {
            // 如果处理出错，显示错误样式
            titleEl.classList.add('filename-display-error');
            if (result.error) {
                titleEl.setAttribute('aria-label', result.error);
            }
            return;
        }

        // 更新显示名称
        titleEl.textContent = result.displayName;
        titleEl.classList.remove('filename-display-error');
        
        // 如果显示名称与实际文件名不同，设置工具提示
        if (result.displayName !== file.basename) {
            titleEl.setAttribute('aria-label', file.basename);
        } else {
            titleEl.removeAttribute('aria-label');
        }
    }

    /**
     * 更新文件元素显示
     * @param titleEl 标题元素
     * @param file 文件对象
     */
    public updateFileElement(titleEl: HTMLElement, file: TFile): void {
        if (!this.filenameParser.isFileInEnabledFolder(file)) {
            // 如果文件不在启用的文件夹中，恢复为原始名称
            this.restoreDisplayName(titleEl);
            return;
        }

        // 获取原始显示名称并存储
        const originalName = titleEl.textContent || file.basename;
        this.fileDisplayCache.saveOriginalName(file.path, originalName);
        
        // 使用 WeakMap 保存元素与文件路径和原始名称的关系
        this.fileDisplayCache.saveElementData(titleEl, file.path, originalName);
        
        // 处理文件名获取显示名称
        const processResult = this.processFile(file);
        
        // 应用显示名称到元素
        this.applyDisplayNameToElement(titleEl, file, processResult);
    }
    
    /**
     * 恢复单个元素的显示名称
     * @param titleEl 标题元素
     */
    public restoreDisplayName(titleEl: HTMLElement): void {
        // 首先尝试从 WeakMap 中获取信息
        const elementData = this.fileDisplayCache.getElementData(titleEl);
        if (elementData) {
            titleEl.textContent = elementData.originalName;
            titleEl.removeAttribute('aria-label');
            titleEl.classList.remove('filename-display-error');
            return;
        }
        
        // 如果 WeakMap 中没有，回退到使用 path 属性查找
        const filePath = titleEl.getAttribute('data-path');
        if (filePath) {
            const originalName = this.fileDisplayCache.getOriginalName(filePath);
            if (originalName) {
                titleEl.textContent = originalName;
                titleEl.removeAttribute('aria-label');
                titleEl.classList.remove('filename-display-error');
            }
        }
    }
    
    // 设置文件资源管理器观察器
    public setupObservers(): void {
        this.logger.log('设置文件资源管理器观察器...');
        
        // 如果已经有活跃的观察器，先停止它
        this.stopObserving();
        
        // 只有在文件资源管理器存在时才设置观察器
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        if (fileExplorers.length === 0) {
            // 没有文件资源管理器，设置一个监听器等待其创建
            this.plugin.registerEvent(
                this.plugin.app.workspace.on('layout-change', () => {
                    // 检查文件资源管理器是否已创建
                    if (this.plugin.app.workspace.getLeavesOfType('file-explorer').length > 0) {
                        this.setupObservers();
                    }
                })
            );
            this.logger.log('文件资源管理器尚未加载，已注册布局变化监听器');
            return;
        }
        
        // 文件资源管理器存在，设置观察器
        this.setupFileExplorerObserver();
        this.setupFolderObserver();
        this.logger.log('文件资源管理器观察器已完成初始化');
    }
    
    // 停止所有观察
    private stopObserving(): void {
        if (this.fileExplorerObserver) {
            this.fileExplorerObserver.disconnect();
            this.fileExplorerObserver = null;
        }
        
        if (this.folderObserver) {
            this.folderObserver.disconnect();
            this.folderObserver = null;
        }
    }
    
    // 设置文件资源管理器的DOM观察器
    private setupFileExplorerObserver(): void {
        // 创建MutationObserver实例监听DOM变化
        this.fileExplorerObserver = new MutationObserver((mutations) => {
            // 如果发现文件名相关元素变化，更新文件显示
            let shouldUpdate = false;
            let addedNodes: Node[] = [];
            
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    // 收集所有添加的节点
                    addedNodes = [...addedNodes, ...Array.from(mutation.addedNodes)];
                    
                    // 检查变动是否与文件名相关
                    const hasFileItems = Array.from(mutation.addedNodes).some(node => {
                        if (node instanceof HTMLElement) {
                            return node.classList.contains('nav-file-title') || 
                                  node.querySelector('.nav-file-title') !== null;
                        }
                        return false;
                    });
                    
                    if (hasFileItems) {
                        shouldUpdate = true;
                    }
                }
            }
            
            if (shouldUpdate) {
                // 增量更新：只更新新添加的节点
                this.updateAddedNodes(addedNodes);
            }
        });

        this.startObserving();
    }
    
    // 设置文件夹展开/折叠观察器
    private setupFolderObserver(): void {
        // 使用布局变化事件监听，更稳健地捕获文件夹展开/折叠
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('layout-change', () => {
                // 延迟处理，等待DOM完全更新
                setTimeout(() => {
                    const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
                    fileExplorers.forEach((explorer: WorkspaceLeaf) => {
                        const container = explorer.view.containerEl;
                        if (!container) return;
                        
                        // 查找所有展开的文件夹
                        const expandedFolders = container.querySelectorAll('.nav-folder:not(.is-collapsed)');
                        expandedFolders.forEach((folderElement) => {
                            if (folderElement instanceof HTMLElement && 
                                !folderElement.hasAttribute('data-observer-processed')) {
                                
                                this.processFolderContent(folderElement);
                                // 标记已处理，避免重复处理
                                folderElement.setAttribute('data-observer-processed', 'true');
                            }
                        });
                        
                        // 同时监听展开/折叠按钮的点击
                        const folderArrows = container.querySelectorAll('.nav-folder-collapse-indicator');
                        folderArrows.forEach((arrow) => {
                            if (arrow instanceof HTMLElement && 
                                !arrow.hasAttribute('data-observer-click')) {
                                    
                                arrow.setAttribute('data-observer-click', 'true');
                                arrow.addEventListener('click', (event) => {
                                    // 延迟处理，等待文件夹状态更新
                                    setTimeout(() => {
                                        const folderElement = (event.target as HTMLElement)
                                            .closest('.nav-folder') as HTMLElement;
                                        
                                        if (folderElement) {
                                            if (folderElement.classList.contains('is-collapsed')) {
                                                this.onFolderCollapse(folderElement);
                                            } else {
                                                folderElement.removeAttribute('data-observer-processed');
                                                this.onFolderExpand(folderElement);
                                            }
                                        }
                                    }, 100);
                                });
                            }
                        });
                    });
                }, 200);
            })
        );
        
        this.logger.log('文件夹展开/折叠观察器设置成功');
    }
    
    // 处理文件夹内容
    private processFolderContent(folderElement: HTMLElement): void {
        const folderPath = this.getFolderPath(folderElement);
        if (folderPath) {
            const files = this.getFilesInFolder(folderPath);
            files.forEach(file => this.updateFileExplorerDisplay(file));
        }
    }
    
    // 文件夹展开处理
    private onFolderExpand(folderElement: HTMLElement): void {
        this.processFolderContent(folderElement);
    }
    
    // 文件夹折叠处理
    private onFolderCollapse(folderElement: HTMLElement): void {
        // 可以在这里添加折叠时的处理逻辑
    }
    
    // 获取文件夹路径
    private getFolderPath(element: HTMLElement): string {
        const pathAttr = element.getAttribute('data-path');
        return pathAttr || '';
    }
    
    // 获取文件夹中的文件
    private getFilesInFolder(folderPath: string): TFile[] {
        return this.plugin.app.vault.getMarkdownFiles().filter((file: TFile) => 
            file.path.startsWith(folderPath + '/'));
    }
    
    // 开始观察文件资源管理器
    private startObserving(): void {
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        
        fileExplorers.forEach((explorer: WorkspaceLeaf) => {
            try {
                const container = explorer.view.containerEl;
                if (container) {
                    // 找到文件列表容器，减少观察范围
                    const fileListContainer = container.querySelector('.nav-files-container');
                    if (fileListContainer) {
                        this.fileExplorerObserver?.observe(fileListContainer, {
                            childList: true,
                            subtree: true,
                            attributes: false,
                            characterData: false
                        });
                        this.logger.log('成功设置文件资源管理器观察器');
                    } else {
                        // 如果找不到特定容器，回退到原始行为
                        this.fileExplorerObserver?.observe(container, {
                            childList: true,
                            subtree: true,
                            attributes: false,
                            characterData: false
                        });
                    }
                }
            } catch (error) {
                this.logger.error('设置文件资源管理器观察器时发生错误:', error);
            }
        });
    }
    
    // 重置文件资源管理器观察器
    public resetObservers(): void {
        this.logger.log('重置文件资源管理器观察器...');
        this.stopObserving();
        this.setupObservers();
    }
    
    // 更新文件资源管理器中的文件显示
    public async updateFileExplorerDisplay(file: TFile): Promise<void> {
        try {
            if (!file) {
                return;
            }
            
            // 使用 Obsidian 的工作区 API
            const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
            if (fileExplorers.length === 0) {
                return;
            }
            
            for (const explorer of fileExplorers) {
                // 获取文件资源管理器视图
                const fileExplorerView = explorer.view as any;
                if (fileExplorerView && fileExplorerView.fileItems) {
                    // 使用视图的方法更新特定文件
                    const fileItem = fileExplorerView.fileItems[file.path];
                    if (fileItem) {
                        // 获取文件标题元素
                        const titleEl = fileItem.titleEl?.querySelector('.nav-file-title-content');
                        if (titleEl) {
                            this.updateFileElement(titleEl, file);
                        }
                    }
                }
            }
            
            // 作为后备方案，如果通过 API 无法找到元素，则使用 DOM 查询
            // 这是为了保持兼容性，确保在不同版本的 Obsidian 中都能正常工作
            if (document && this.plugin.settings.fallbackToDOMForFileExplorer) {
                const fileItems = document.querySelectorAll('.nav-file-title[data-path="' + file.path + '"]');
                if (fileItems.length > 0) {
                    for (let i = 0; i < fileItems.length; i++) {
                        const fileItem = fileItems[i] as HTMLElement;
                        const titleEl = fileItem.querySelector('.nav-file-title-content') as HTMLElement;
                        if (titleEl) {
                            this.updateFileElement(titleEl, file);
                        }
                    }
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
    
    /**
     * 释放资源
     */
    public dispose(): void {
        this.logger.log('释放 FileExplorerDisplayService 资源...');
        
        // 取消所有事件订阅
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        
        // 停止观察器
        this.stopObserving();
        
        // 恢复所有显示名称
        this.restoreAllDisplayNames();
        
        this.logger.log('FileExplorerDisplayService 资源已释放');
    }
} 