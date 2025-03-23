import { TFile, WorkspaceLeaf, normalizePath } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { IFilenameParser, IFileDisplayCache, IFileExplorerDisplayService, IEventManagerService, ILoggerService } from './interfaces/IServices';
import { FileEventType, FileEvent } from './EventManagerService';
import { BaseFileProcessor } from '../core/BaseFileProcessor';
import { ServiceContainer } from '../core/ServiceContainer';
import { FileNameDisplayManager } from './display/FileNameDisplayManager';

export class FileExplorerDisplayService extends BaseFileProcessor implements IFileExplorerDisplayService {
    private eventManager: IEventManagerService;
    private unsubscribers: (() => void)[] = [];
    private displayManager: FileNameDisplayManager;
    
    // 从 FileExplorerObserver 合并的属性
    private fileExplorerObserver: MutationObserver | null = null;
    private folderObserver: MutationObserver | null = null;
    
    // 缓存DOM查询结果
    private fileExplorerCache: Map<string, HTMLElement[]> = new Map();
    private isObserving = false;
    private fileExplorerObserverConfig: MutationObserverInit | null = null;

    /**
     * 静态工厂方法，从服务容器获取依赖
     */
    public static create(plugin: ITitleExtractorPlugin): FileExplorerDisplayService {
        const container = ServiceContainer.getInstance();
        
        // 从容器中获取依赖
        const filenameParser = container.get<IFilenameParser>('filenameParser');
        const fileDisplayCache = container.get<IFileDisplayCache>('fileDisplayCache');
        const eventManager = container.get<IEventManagerService>('eventManager');
        const loggerService = container.get<ILoggerService>('loggerService');
        
        // 创建显示管理器
        const displayManager = new FileNameDisplayManager(
            fileDisplayCache,
            filenameParser,
            loggerService
        );
        
        // 创建服务实例
        return new FileExplorerDisplayService(
            plugin, 
            filenameParser, 
            fileDisplayCache, 
            eventManager, 
            loggerService,
            displayManager
        );
    }

    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: IFilenameParser,
        fileDisplayCache: IFileDisplayCache,
        eventManager: IEventManagerService,
        loggerService: ILoggerService,
        displayManager: FileNameDisplayManager
    ) {
        super(plugin, filenameParser, fileDisplayCache, loggerService);
        this.eventManager = eventManager;
        this.displayManager = displayManager;
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
        // 首先收集所有需要处理的元素和文件
        interface ElementFileMapping {
            element: HTMLElement;
            titleElement: HTMLElement;
            file: TFile;
            path: string;
        }
        
        const elementsToProcess: ElementFileMapping[] = [];
        
        // 一次性筛选出所有文件项
        const fileItems = nodes.filter(node => {
            if (node instanceof HTMLElement) {
                return node.classList.contains('nav-file-title') || 
                      node.querySelector('.nav-file-title') !== null;
            }
            return false;
        }) as HTMLElement[];
        
        // 批量获取需要处理的元素
        for (const item of fileItems) {
            // 确定实际的文件元素
            const fileEl = item.classList.contains('nav-file-title') ? 
                          item : item.querySelector('.nav-file-title');
                          
            if (!fileEl) continue;
            
            const path = fileEl.getAttribute('data-path');
            if (!path) continue;
            
            const normalizedPath = normalizePath(path);
            
            // 使用规范化路径获取文件
            const file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
            if (!(file instanceof TFile)) continue;
            
            // 查找标题元素
            const titleEl = fileEl.querySelector('.nav-file-title-content') as HTMLElement;
            if (!titleEl) continue;
            
            // 为了避免重复处理，检查是否已经处理过
            const isAlreadyProcessed = this.fileDisplayCache?.hasDisplayName?.(normalizedPath) || false;
            if (isAlreadyProcessed) {
                // 已经处理过，但确保更新缓存
                this.updateFileExplorerCache(normalizedPath, titleEl);
                continue;
            }
            
            // 收集所有需要处理的元素和文件
            elementsToProcess.push({ 
                element: fileEl as HTMLElement, 
                titleElement: titleEl,
                file: file,
                path: normalizedPath
            });
        }
        
        // 性能优化：如果需要处理的元素超过特定数量，使用批处理
        if (elementsToProcess.length > 10) {
            // 分批处理以避免阻塞UI
            const elements = elementsToProcess.map(mapping => mapping.titleElement);
            const files = elementsToProcess.map(mapping => mapping.file);
            
            // 使用批处理器处理大量元素
            this.displayManager.batchProcessElements(elements, files);
            
            // 批量更新缓存
            for (const mapping of elementsToProcess) {
                this.updateFileExplorerCache(mapping.path, mapping.titleElement);
            }
        } else {
            // 数量较少时直接处理
            for (const mapping of elementsToProcess) {
                // 使用显示管理器处理文件元素
                this.displayManager.processAndApplyDisplayName(mapping.titleElement, mapping.file);
                
                // 更新缓存
                this.updateFileExplorerCache(mapping.path, mapping.titleElement);
            }
        }
    }

    /**
     * 更新文件浏览器缓存
     */
    private updateFileExplorerCache(path: string, element: HTMLElement): void {
        const normalizedPath = normalizePath(path);
        let elements = this.fileExplorerCache.get(normalizedPath);
        
        if (!elements) {
            elements = [];
            this.fileExplorerCache.set(normalizedPath, elements);
        }
        
        if (!elements.includes(element)) {
            elements.push(element);
        }
    }

    /**
     * 从缓存中获取文件元素
     */
    private getFileElementsFromCache(path: string): HTMLElement[] | undefined {
        const normalizedPath = normalizePath(path);
        return this.fileExplorerCache.get(normalizedPath);
    }

    /**
     * 清除文件的缓存元素
     */
    private clearFileElementsCache(path: string): void {
        const normalizedPath = normalizePath(path);
        this.fileExplorerCache.delete(normalizedPath);
    }

    /**
     * 更新文件元素显示
     */
    public updateFileElement(titleEl: HTMLElement, file: TFile): void {
        // 直接使用显示管理器处理
        this.displayManager.processAndApplyDisplayName(titleEl, file);
        
        // 更新缓存
        this.updateFileExplorerCache(file.path, titleEl);
    }

    /**
     * 恢复元素的原始显示名称
     */
    public restoreDisplayName(titleEl: HTMLElement): void {
        this.displayManager.restoreDisplayName(titleEl);
    }

    /**
     * 设置观察者
     */
    public setupObservers(): void {
        this.logger.debug('设置文件浏览器观察者');
        
        this.stopObserving();
        this.setupFileExplorerObserver();
        this.setupFolderObserver();
        this.startObserving();
    }

    /**
     * 停止观察
     */
    private stopObserving(): void {
        if (this.fileExplorerObserver) {
            this.fileExplorerObserver.disconnect();
            this.fileExplorerObserver = null;
        }
        
        if (this.folderObserver) {
            this.folderObserver.disconnect();
            this.folderObserver = null;
        }
        
        this.isObserving = false;
    }

    /**
     * 设置文件浏览器观察者
     */
    private setupFileExplorerObserver(): void {
        if (this.fileExplorerObserver) {
            this.fileExplorerObserver.disconnect();
        }
        
        // 使用更精确的观察配置，减少不必要的触发
        const observerConfig = {
            childList: true,     // 只关注子节点变化
            subtree: true,       // 观察整个子树
            attributeFilter: ['data-path'], // 只关注data-path属性变化
            attributes: true,    // 启用属性观察
            characterData: false // 不观察文本内容变化
        };
        
        // 将配置保存为类字段，便于其他方法使用
        this.fileExplorerObserverConfig = observerConfig;
        
        this.fileExplorerObserver = new MutationObserver((mutations) => {
            // 如果变更太多，直接处理所有可见文件
            if (mutations.length > 30) {
                this.logger.debug(`检测到大量变更 (${mutations.length})，重新处理所有可见文件`);
                this.processVisibleFiles();
                return;
            }
            
            // 收集新增节点和需要更新的文件路径
            const addedNodes: Node[] = [];
            const changedPaths = new Set<string>();
            
            // 处理每个变更
            for (const mutation of mutations) {
                // 处理子节点新增
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // 筛选有效的DOM节点
                    const validNodes = Array.from(mutation.addedNodes).filter(
                        node => node instanceof HTMLElement
                    );
                    addedNodes.push(...validNodes);
                }
                // 处理属性变化
                else if (mutation.type === 'attributes' && 
                         mutation.attributeName === 'data-path' &&
                         mutation.target instanceof HTMLElement) {
                    const path = mutation.target.getAttribute('data-path');
                    if (path) {
                        changedPaths.add(normalizePath(path));
                    }
                }
            }
            
            // 如果有新增节点，批量处理
            if (addedNodes.length > 0) {
                this.logger.debug(`处理 ${addedNodes.length} 个新增节点`);
                this.updateAddedNodes(addedNodes);
            }
            
            // 如果有data-path属性变化，更新相应文件
            if (changedPaths.size > 0) {
                this.logger.debug(`处理 ${changedPaths.size} 个路径变更`);
                changedPaths.forEach(path => {
                    const file = this.plugin.app.vault.getAbstractFileByPath(path);
                    if (file instanceof TFile) {
                        this.updateFileExplorerDisplay(file).catch(err => {
                            this.logger.error(`更新文件 ${path} 显示失败:`, err);
                        });
                    }
                });
            }
        });
    }

    /**
     * 设置文件夹观察者
     */
    private setupFolderObserver(): void {
        if (this.folderObserver) {
            this.folderObserver.disconnect();
        }
        
        // 仅观察文件夹展开/折叠状态变化
        const folderObserverConfig = {
            attributes: true,
            attributeFilter: ['class'],
            subtree: true
        };
        
        this.folderObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && 
                    mutation.attributeName === 'class' && 
                    mutation.target instanceof HTMLElement) {
                    
                    const element = mutation.target;
                    
                    // 检查是否是文件夹元素且状态有变化
                    if (element.classList.contains('nav-folder') && 
                        !element.classList.contains('mod-root')) {
                        
                        // 判断文件夹是否展开还是折叠
                        if (!element.classList.contains('is-collapsed')) {
                            // 文件夹展开
                            this.onFolderExpand(element);
                        } else {
                            // 文件夹折叠
                            this.onFolderCollapse(element);
                        }
                    }
                }
            }
        });
    }

    /**
     * 处理文件夹内容
     */
    private processFolderContent(folderElement: HTMLElement): void {
        // 获取文件夹路径
        const folderPath = this.getFolderPath(folderElement);
        if (!folderPath) return;
        
        // 使用结构化类型收集待处理元素
        type ElementFilePair = {
            element: HTMLElement;
            file: TFile;
            path: string;
        };
        
        const elementsToProcess: ElementFilePair[] = [];
        
        // 处理文件夹中的文件
        const fileElements = folderElement.querySelectorAll('.nav-file-title');
        
        // 收集所有需要处理的元素和文件
        fileElements.forEach((fileEl) => {
            const path = fileEl.getAttribute('data-path');
            if (!path) return;
            
            const normalizedPath = normalizePath(path);
            const file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
            
            if (!(file instanceof TFile)) return;
            
            const titleEl = fileEl.querySelector('.nav-file-title-content') as HTMLElement;
            if (!titleEl) return;
            
            // 检查缓存状态
            const isAlreadyProcessed = this.fileDisplayCache?.hasDisplayName?.(normalizedPath) || false;
            if (isAlreadyProcessed) {
                // 确保缓存更新
                this.updateFileExplorerCache(normalizedPath, titleEl);
                return;
            }
            
            elementsToProcess.push({
                element: titleEl,
                file: file,
                path: normalizedPath
            });
        });
        
        // 如果元素数量较多，使用批处理
        const BATCH_THRESHOLD = 10; // 超过10个元素使用批处理
        
        if (elementsToProcess.length > BATCH_THRESHOLD) {
            this.logger.debug(`使用批处理模式处理文件夹 ${folderPath} 中的 ${elementsToProcess.length} 个文件元素`);
            
            // 提取元素和文件用于批处理
            const elements = elementsToProcess.map(pair => pair.element);
            const files = elementsToProcess.map(pair => pair.file);
            
            // 使用批处理器处理
            this.displayManager.batchProcessElements(elements, files);
            
            // 批量更新缓存
            for (const pair of elementsToProcess) {
                this.updateFileExplorerCache(pair.path, pair.element);
            }
        } else {
            // 元素数量较少，逐个处理
            for (const pair of elementsToProcess) {
                this.updateFileElement(pair.element, pair.file);
            }
        }
    }

    /**
     * 文件夹展开事件处理
     */
    private onFolderExpand(folderElement: HTMLElement): void {
        this.processFolderContent(folderElement);
    }

    /**
     * 文件夹折叠事件处理
     */
    private onFolderCollapse(folderElement: HTMLElement): void {
        // 文件夹折叠时不需要特殊处理
    }

    /**
     * 获取文件夹路径
     */
    private getFolderPath(element: HTMLElement): string {
        const pathEl = element.querySelector('.nav-folder-title');
        return pathEl ? pathEl.getAttribute('data-path') || '' : '';
    }

    /**
     * 获取文件夹中的文件
     */
    private getFilesInFolder(folderPath: string): TFile[] {
        return this.plugin.app.vault.getMarkdownFiles()
            .filter(file => {
                const filePath = file.path;
                const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
                return fileDir === folderPath;
            });
    }

    /**
     * 开始观察
     */
    private startObserving(): void {
        if (this.isObserving) return;
        
        const fileExplorer = this.getFileExplorer();
        if (!fileExplorer) {
            this.logger.warn('找不到文件浏览器DOM元素');
            return;
        }
        
        // 启动文件浏览器观察者
        if (this.fileExplorerObserver) {
            // 使用定义好的配置
            this.fileExplorerObserver.observe(fileExplorer, this.fileExplorerObserverConfig || {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-path']
            });
        }
        
        // 启动文件夹观察者
        if (this.folderObserver) {
            this.folderObserver.observe(fileExplorer, {
                attributes: true,
                attributeFilter: ['class'],
                subtree: true
            });
        }
        
        this.isObserving = true;
        
        // 初始处理所有可见文件
        this.processVisibleFiles();
    }
    
    /**
     * 处理可见文件
     */
    private processVisibleFiles(): void {
        const fileExplorer = this.getFileExplorer();
        if (!fileExplorer) return;
        
        // 使用结构化类型收集待处理元素
        type ElementFilePair = {
            element: HTMLElement;
            file: TFile;
            path: string;
        };
        
        const elementsToProcess: ElementFilePair[] = [];
        
        // 获取所有文件标题元素
        const titleElements = fileExplorer.querySelectorAll('.nav-file-title-content');
        
        // 收集所有需要处理的元素和对应的文件
        titleElements.forEach((titleEl) => {
            const fileEl = titleEl.closest('.nav-file-title');
            if (!fileEl) return;
            
            const path = fileEl.getAttribute('data-path');
            if (!path) return;
            
            const normalizedPath = normalizePath(path);
            const file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
            
            if (!(file instanceof TFile)) return;
            
            // 检查是否已经处理过
            const isAlreadyProcessed = this.fileDisplayCache?.hasDisplayName?.(normalizedPath) || false;
            if (isAlreadyProcessed) {
                // 确保缓存更新
                this.updateFileExplorerCache(normalizedPath, titleEl as HTMLElement);
                return;
            }
            
            elementsToProcess.push({
                element: titleEl as HTMLElement,
                file: file,
                path: normalizedPath
            });
        });
        
        // 如果元素数量超过阈值，使用批处理方式
        const BATCH_THRESHOLD = 20; // 超过20个元素使用批处理
        
        if (elementsToProcess.length > BATCH_THRESHOLD) {
            this.logger.debug(`使用批处理模式处理 ${elementsToProcess.length} 个文件元素`);
            
            // 提取所有元素和文件，用于批处理
            const elements = elementsToProcess.map(pair => pair.element);
            const files = elementsToProcess.map(pair => pair.file);
            
            // 使用批处理器处理
            this.displayManager.batchProcessElements(elements, files);
            
            // 批量更新缓存
            for (const pair of elementsToProcess) {
                this.updateFileExplorerCache(pair.path, pair.element);
            }
        } else {
            // 元素数量较少，逐个处理
            for (const pair of elementsToProcess) {
                this.updateFileElement(pair.element, pair.file);
            }
        }
    }

    /**
     * 重置观察者
     */
    public resetObservers(): void {
        this.stopObserving();
        this.setupObservers();
    }

    /**
     * 更新文件在文件浏览器中的显示
     */
    public async updateFileExplorerDisplay(file: TFile): Promise<void> {
        if (!this.filenameParser.isFileInEnabledFolder(file)) {
            return;
        }
        
        // 尝试从缓存获取文件元素
        let fileElements = this.getFileElementsFromCache(file.path);
        
        // 如果缓存中没有，则进行DOM查询
        if (!fileElements || fileElements.length === 0) {
            fileElements = this.findFileElements(file);
            
            // 更新缓存
            if (fileElements.length > 0) {
                this.fileExplorerCache.set(file.path, fileElements);
            }
        }
        
        // 批量处理文件元素
        if (fileElements.length > 0) {
            const files = Array(fileElements.length).fill(file);
            this.displayManager.batchProcessElements(fileElements, files);
        }
    }

    /**
     * 查找文件对应的DOM元素
     */
    private findFileElements(file: TFile): HTMLElement[] {
        const elements: HTMLElement[] = [];
        const fileExplorer = this.getFileExplorer();
        if (!fileExplorer) return elements;
        
        // 使用精确的选择器
        const fileSelector = `.nav-file-title[data-path="${CSS.escape(file.path)}"] .nav-file-title-content`;
        const fileEls = fileExplorer.querySelectorAll<HTMLElement>(fileSelector);
        
        fileEls.forEach(el => {
            if (el) {
                elements.push(el);
            }
        });
        
        return elements;
    }

    /**
     * 获取文件浏览器DOM元素
     */
    private getFileExplorer(): HTMLElement | null {
        return document.querySelector('.nav-files-container');
    }

    /**
     * 恢复所有文件的原始显示名称
     */
    public restoreAllDisplayNames(): void {
        const fileExplorer = this.getFileExplorer();
        if (!fileExplorer) return;
        
        // 获取所有文件标题元素
        const titleElements = fileExplorer.querySelectorAll<HTMLElement>('.nav-file-title-content');
        
        // 恢复原始名称
        titleElements.forEach((titleEl) => {
            this.displayManager.restoreDisplayName(titleEl);
        });
        
        // 清空元素缓存
        this.fileExplorerCache.clear();
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        // 停止观察
        this.stopObserving();
        
        // 取消事件订阅
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
        this.unsubscribers = [];
        
        // 清空缓存
        this.fileExplorerCache.clear();
        
        // 清理显示管理器
        this.displayManager.dispose();
        
        this.logger.debug('FileExplorerDisplayService 资源已释放');
    }
} 