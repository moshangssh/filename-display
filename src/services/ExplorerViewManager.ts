import { TFile, WorkspaceLeaf, normalizePath, TFolder } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { IFilenameParser, IFileDisplayCache, ILoggerService, IExplorerViewManager } from './interfaces/IServices';
import { ServiceContainer } from '../core/ServiceContainer';
import { EventBus } from '../core/events/EventBus';
import { VirtualListManager } from './VirtualListManager';
import { DOMCacheManager } from './DOMCacheManager';
import { IncrementalUpdateManager } from './IncrementalUpdateManager';

/**
 * 文件浏览器视图管理器
 * 
 * 负责处理文件浏览器中的文件名显示。整合了原有的FileExplorerDisplayService
 * 和FileNameDisplayManager的功能，使管理模式与Reading View和Editing View保持一致。
 * 
 * 主要功能：
 * 1. 监控文件浏览器DOM变化
 * 2. 处理文件夹展开/折叠事件
 * 3. 维护文件元素的缓存
 * 4. 管理文件名的显示逻辑
 * 5. 提供批量处理能力
 * 
 * @since 1.5.0
 */
export class ExplorerViewManager implements IExplorerViewManager {
    private logger: ILoggerService;
    private eventBus: EventBus;
    
    // 从FileExplorerDisplayService迁移的属性
    private fileExplorerObserver: MutationObserver | null = null;
    private folderObserver: MutationObserver | null = null;
    private fileExplorerCache: Map<string, HTMLElement[]> = new Map();
    private isObserving = false;
    private fileExplorerObserverConfig: MutationObserverInit | null = null;
    
    // 防抖相关属性
    private updateDebounceTimeout: NodeJS.Timeout | null = null;
    private processDebounceTimeout: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_DELAY = 150; // 防抖延迟时间（毫秒）
    
    // 文件显示结果临时缓存
    private displayResultCache: Map<string, FileDisplayResult> = new Map();
    private processingFiles: Set<string> = new Set();

    // 虚拟列表管理器
    private virtualList: VirtualListManager | null = null;

    // DOM缓存管理器
    private domCache: DOMCacheManager;

    // 增量更新管理器
    private incrementalUpdate: IncrementalUpdateManager;

    /**
     * 静态工厂方法，从服务容器获取依赖
     */
    public static create(plugin: ITitleExtractorPlugin): ExplorerViewManager {
        const container = ServiceContainer.getInstance();
        
        // 获取依赖
        const filenameParser = container.get<IFilenameParser>('filenameParser');
        const fileDisplayCache = container.get<IFileDisplayCache>('fileDisplayCache');
        const loggerService = container.get<ILoggerService>('loggerService');
        
        return new ExplorerViewManager(
            plugin, 
            filenameParser, 
            fileDisplayCache, 
            loggerService
        );
    }

    constructor(
        private plugin: ITitleExtractorPlugin, 
        private filenameParser: IFilenameParser, 
        private fileDisplayCache: IFileDisplayCache,
        loggerService: ILoggerService
    ) {
        this.logger = loggerService.getLogger('ExplorerViewManager');
        this.eventBus = EventBus.getInstance();
        
        // 初始化增量更新管理器
        this.incrementalUpdate = new IncrementalUpdateManager({
            batchSize: 30,         // 每批30个项目
            batchDelay: 20,        // 20ms延迟
            maxQueueSize: 500,     // 最多500个项目
            updateInterval: 150    // 150ms检查一次更新
        }, this.logger, this.handleIncrementalUpdate.bind(this));
        
        // 初始化DOM缓存管理器
        this.domCache = new DOMCacheManager({
            maxSize: 2000,        // 缓存更多元素
            ttl: 600000,         // 10分钟过期
            cleanupInterval: 120000 // 2分钟清理一次
        }, this.logger);
        
        // 初始化虚拟列表
        this.virtualList = new VirtualListManager({}, this.logger);
        
        this.setupEventSubscriptions();
        this.logger.info('ExplorerViewManager 初始化完成');
    }

    /**
     * 设置事件订阅
     */
    private setupEventSubscriptions(): void {
        // 监听文件重命名事件
        this.eventBus.subscribe('file:rename', async (file: TFile) => {
            this.logger.debug(`文件重命名: ${file.path}`);
            await this.updateFileItem(file);
        });

        // 监听文件修改事件
        this.eventBus.subscribe('file:modify', async (file: TFile) => {
            this.logger.debug(`文件修改: ${file.path}`);
            await this.updateFileItem(file);
        });

        // 监听缓存更新事件
        this.eventBus.subscribe('cache:update', async (file: TFile) => {
            this.logger.debug(`缓存更新: ${file.path}`);
            await this.updateFileItem(file);
        });

        // 监听文件删除事件
        this.eventBus.subscribe('file:delete', (path: string) => {
            this.logger.debug(`文件删除: ${path}`);
            this.clearFileElementsCache(path);
        });
    }

    /**
     * 设置视图，初始化观察者等
     */
    public setupView(): void {
        this.logger.debug('设置文件浏览器视图');
        
        // 检查DOM是否已经准备好
        const isReady = document.querySelector('.nav-files-container') || 
                        document.querySelector('.nav-folder-children') ||
                        document.querySelector('.workspace-leaf-content[data-type="file-explorer"]');
        
        if (!isReady) {
            this.logger.debug('文件浏览器DOM尚未准备好，延迟设置视图');
            // 延迟重试
            setTimeout(() => {
                this.logger.debug('尝试重新设置文件浏览器视图');
                this.setupView();
            }, 500); // 500ms后重试
            return;
        }
        
        // 停止现有观察
        this.stopObserving();
        
        // 初始化虚拟列表
        this.virtualList?.initialize();
        
        // 设置文件浏览器观察者
        this.setupFileExplorerObserver();
        
        // 设置文件夹观察者
        this.setupFolderObserver();
        
        // 开始观察
        this.startObserving();
    }

    /**
     * 更新视图
     */
    public updateView(): void {
        this.logger.debug('更新文件浏览器视图');
        
        // 获取所有可见文件
        const fileExplorer = this.getFileExplorer();
        if (!fileExplorer) return;

        const files = this.getAllFiles();
        
        // 更新虚拟列表
        if (this.virtualList) {
            this.virtualList.updateItems(files);
        }
    }

    /**
     * 获取所有文件
     */
    private getAllFiles(): TFile[] {
        const files: TFile[] = [];
        const vault = this.plugin.app.vault;
        
        // 递归获取所有文件
        const processFolder = (folder: string) => {
            const abstractFile = vault.getAbstractFileByPath(folder);
            if (!(abstractFile instanceof TFolder)) return;
            
            for (const item of abstractFile.children) {
                if (item instanceof TFile) {
                    files.push(item);
                } else if (item instanceof TFolder) {
                    processFolder(item.path);
                }
            }
        };
        
        processFolder('/');
        return files;
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
                        this.updateFileItem(file);
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
                        }
                        // 文件夹折叠时不需要特殊处理
                    }
                }
            }
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
            
            // 添加延迟重试逻辑
            setTimeout(() => {
                this.logger.debug('尝试重新启动文件浏览器观察');
                this.startObserving();
            }, 1000); // 1秒后重试
            
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
     * 获取文件浏览器DOM元素
     */
    private getFileExplorer(): HTMLElement | null {
        return this.domCache.getOrCreate('.nav-files-container', () => {
            // 尝试多种可能的选择器，按优先级排序
            const selectors = [
                '.nav-files-container',           // 标准选择器
                '.nav-folder-children',           // 备选选择器
                '.file-explorer-container',       // 旧版选择器
                '.workspace-leaf-content[data-type="file-explorer"]', // 工作区叶子内容
                '.workspace-tab-container[data-type="file-explorer"]', // 标签容器
                '.mod-root.nav-folder .nav-folder-children' // 根文件夹的子元素
            ];
            
            // 遍历所有选择器直到找到元素
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element instanceof HTMLElement) {
                    this.logger.debug(`找到文件浏览器容器使用选择器: ${selector}`);
                    return element;
                }
            }
            
            this.logger.warn('找不到文件浏览器容器，尝试了多个选择器');
            return null;
        });
    }
    
    /**
     * 文件夹展开事件处理
     */
    private onFolderExpand(folderElement: HTMLElement): void {
        this.processFolderContent(folderElement);
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
            
            // 批量处理元素
            this.batchProcessElements(elements, files);
            
            // 批量更新缓存
            for (const pair of elementsToProcess) {
                this.updateFileExplorerCache(pair.path, pair.element);
            }
        } else {
            // 元素数量较少，逐个处理
            for (const pair of elementsToProcess) {
                this.processFileElement(pair.element, pair.file);
                this.updateFileExplorerCache(pair.path, pair.element);
            }
        }
    }
    
    /**
     * 获取文件夹路径
     */
    private getFolderPath(element: HTMLElement): string {
        const pathEl = element.querySelector('.nav-folder-title');
        return pathEl ? pathEl.getAttribute('data-path') || '' : '';
    }

    /**
     * 处理文件浏览器中的项目
     */
    public processExplorerItems(): void {
        this.logger.debug('处理文件浏览器项目');
        
        this.processVisibleFiles();
    }
    
    /**
     * 更新单个文件项
     * @param file 需要更新的文件
     */
    public updateFileItem(file: TFile): void {
        this.logger.debug(`更新文件项: ${file.path}`);
        
        if (!this.filenameParser.isFileInEnabledFolder(file)) {
            return;
        }
        
        // 使用防抖处理文件更新
        this.debouncedProcessFiles([file]);
    }
    
    /**
     * 处理可见文件
     */
    private processVisibleFiles(): void {
        const fileExplorer = this.getFileExplorer();
        if (!fileExplorer) return;
        
        // 使用防抖处理视图更新
        this.debouncedUpdateView();
    }
    
    /**
     * 更新新添加的节点
     */
    private updateAddedNodes(nodes: Node[]): void {
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
        const filesToProcess: TFile[] = [];
        
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
            
            // 为了避免重复处理，检查是否已经处理过
            const isAlreadyProcessed = this.fileDisplayCache?.hasDisplayName?.(normalizedPath) || false;
            if (isAlreadyProcessed) {
                // 已经处理过，但确保更新缓存
                this.updateFileExplorerCache(normalizedPath, fileEl as HTMLElement);
                continue;
            }
            
            filesToProcess.push(file);
        }
        
        // 使用防抖处理批量文件更新
        if (filesToProcess.length > 0) {
            this.debouncedProcessFiles(filesToProcess);
        }
    }
    
    /**
     * 批量处理文件元素
     */
    private batchProcessElements(elements: HTMLElement[], files: TFile[]): void {
        if (elements.length !== files.length) {
            this.logger.warn('元素数量与文件数量不匹配');
            return;
        }

        for (let i = 0; i < elements.length; i++) {
            this.processFileElement(elements[i], files[i]);
        }
    }
    
    /**
     * 处理单个文件元素
     */
    private async processFileElement(titleEl: HTMLElement, file: TFile): Promise<void> {
        if (!this.filenameParser.isFileInEnabledFolder(file)) {
            // 如果文件不在启用的文件夹中，恢复为原始名称
            this.restoreDisplayName(titleEl);
            return;
        }

        // 获取原始显示名称并存储
        const originalName = titleEl.textContent || file.basename;
        this.fileDisplayCache.saveOriginalName(file.path, originalName);
        
        // 使用缓存保存元素与文件路径和原始名称的关系
        this.fileDisplayCache.saveElementData(titleEl, file.path, originalName);
        
        try {
            // 尝试从缓存获取显示名称
            let displayResult: FileDisplayResult | null = null;
            
            if (this.fileDisplayCache.hasDisplayName(file.path)) {
                const cachedName = this.fileDisplayCache.getDisplayName(file.path);
                if (cachedName) {
                    displayResult = { 
                        success: true, 
                        displayName: cachedName, 
                        fromCache: true 
                    };
                }
            }
            
            // 如果缓存中没有，则从文件获取
            if (!displayResult) {
                displayResult = await this.filenameParser.getDisplayNameFromMetadata(file);
                
                // 如果成功获取，则缓存结果
                if (displayResult.success && displayResult.displayName) {
                    this.fileDisplayCache.setDisplayName(file.path, displayResult.displayName);
                }
            }
            
            // 将更新加入增量更新队列
            if (displayResult.success && displayResult.displayName) {
                this.incrementalUpdate.queueUpdate(
                    file,
                    titleEl,
                    originalName,
                    displayResult.displayName
                );
            } else {
                // 如果获取失败，直接应用错误状态
                this.applyDisplayNameToElement(titleEl, file, displayResult);
            }
        } catch (error) {
            this.logger.error(`处理文件 ${file.path} 显示时出错:`, error);
            const errorResult: FileDisplayResult = {
                success: false,
                displayName: file.basename,
                error: error instanceof Error ? error.message : String(error)
            };
            this.applyDisplayNameToElement(titleEl, file, errorResult);
        }
    }
    
    /**
     * 应用显示名称到HTML元素
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
     * 恢复元素的原始显示名称
     */
    public restoreDisplayName(titleEl: HTMLElement): void {
        try {
            // 从缓存中获取原始名称
            const pathData = this.fileDisplayCache.getElementData(titleEl);
            if (pathData && pathData.originalName) {
                titleEl.textContent = pathData.originalName;
                titleEl.removeAttribute('aria-label');
                titleEl.classList.remove('filename-display-error');
            }
        } catch (error) {
            this.logger.error('恢复显示名称时出错:', error);
        }
    }
    
    /**
     * 查找文件对应的DOM元素
     */
    private findFileElements(file: TFile): HTMLElement[] {
        const cacheKey = `file-elements:${file.path}`;
        
        // 尝试从缓存获取
        const cachedElements = this.domCache.get(cacheKey);
        if (cachedElements) {
            // 验证元素是否仍然有效
            const elements = Array.from(cachedElements.children) as HTMLElement[];
            if (elements.length > 0 && elements[0].isConnected) {
                return elements;
            }
        }
        
        // 如果缓存未命中或元素无效，重新查询
        const fileExplorer = this.getFileExplorer();
        if (!fileExplorer) return [];
        
        // 使用精确的选择器
        const fileSelector = `.nav-file-title[data-path="${CSS.escape(file.path)}"] .nav-file-title-content`;
        const fileEls = Array.from(fileExplorer.querySelectorAll<HTMLElement>(fileSelector));
        
        // 如果找到元素，创建一个容器元素来缓存
        if (fileEls.length > 0) {
            const container = document.createElement('div');
            fileEls.forEach(el => container.appendChild(el.cloneNode(true)));
            this.domCache.set(cacheKey, container);
        }
        
        return fileEls;
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
     * 恢复所有文件的原始显示名称
     */
    public restoreAllDisplayNames(): void {
        const fileExplorer = this.getFileExplorer();
        if (!fileExplorer) return;
        
        // 获取所有文件标题元素
        const titleElements = fileExplorer.querySelectorAll<HTMLElement>('.nav-file-title-content');
        
        // 恢复原始名称
        titleElements.forEach((titleEl) => {
            this.restoreDisplayName(titleEl);
        });
        
        // 清空元素缓存
        this.fileExplorerCache.clear();
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        this.logger.debug('释放ExplorerViewManager资源');
        
        // 清理增量更新管理器
        this.incrementalUpdate.dispose();
        
        // 清理DOM缓存
        this.domCache.dispose();
        
        // 清理虚拟列表
        this.virtualList?.dispose();
        this.virtualList = null;
        
        // 清理观察者
        if (this.fileExplorerObserver) {
            this.fileExplorerObserver.disconnect();
            this.fileExplorerObserver = null;
        }
        
        if (this.folderObserver) {
            this.folderObserver.disconnect();
            this.folderObserver = null;
        }
        
        // 清理缓存
        this.fileExplorerCache.clear();
        this.displayResultCache.clear();
        this.processingFiles.clear();
        this.isObserving = false;
    }

    /**
     * 创建防抖函数
     * @param func 需要防抖的函数
     * @param delay 延迟时间（毫秒）
     */
    private debounce<T extends (...args: any[]) => void>(
        func: T,
        delay: number
    ): (...args: Parameters<T>) => void {
        let timeoutId: NodeJS.Timeout | null = null;
        
        return (...args: Parameters<T>) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            timeoutId = setTimeout(() => {
                func.apply(this, args);
                timeoutId = null;
            }, delay);
        };
    }

    /**
     * 防抖处理的更新视图方法
     */
    private debouncedUpdateView = this.debounce(() => {
        this.logger.debug('执行防抖后的视图更新');
        this.updateView();
    }, this.DEBOUNCE_DELAY);

    /**
     * 防抖处理的文件处理方法
     */
    private debouncedProcessFiles = this.debounce((files: TFile[]) => {
        this.logger.debug(`执行防抖后的文件处理，共 ${files.length} 个文件`);
        this.batchProcessElements(
            files.map(f => this.findFileElements(f)).flat(),
            files
        );
    }, this.DEBOUNCE_DELAY);

    /**
     * 处理增量更新回调
     */
    private async handleIncrementalUpdate(items: { 
        file: TFile; 
        element: HTMLElement; 
        oldValue: string; 
        newValue: string; 
    }[]): Promise<void> {
        try {
            // 批量处理更新项
            for (const item of items) {
                // 检查元素是否仍然有效
                if (!item.element.isConnected) continue;

                // 检查值是否已经改变
                if (item.element.textContent !== item.oldValue) continue;

                // 处理文件元素
                await this.processFileElement(item.element, item.file);
            }
        } catch (error) {
            this.logger.error('处理增量更新时出错:', error);
        }
    }
} 