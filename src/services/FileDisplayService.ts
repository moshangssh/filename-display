import { Notice, TFile, TAbstractFile, Vault, MarkdownView, normalizePath } from 'obsidian';
import type { FilenameDisplaySettings, IFilenameDisplayPlugin, FileDisplayResult } from '../types';

export class FileDisplayService {
    private originalDisplayNames: Map<string, string> = new Map();
    private plugin: IFilenameDisplayPlugin;
    private fileExplorerCache: WeakMap<Element, Element[]> = new WeakMap();
    // 新增的文件名处理缓存，保存文件路径到显示名称的映射
    private fileDisplayCache: Map<string, string> = new Map();
    // 新增的已处理文件集合，用于追踪哪些文件已经被处理过
    private processedFiles: Set<string> = new Set();
    private fileExplorerObserver: MutationObserver | null = null;
    private updateTimer: number | null = null;
    private processQueue: Array<TFile>;
    private processingBatch: boolean;
    private processedFolders: Set<string>;
    private batchSize: number = 50;

    constructor(plugin: IFilenameDisplayPlugin) {
        this.plugin = plugin;
        this.processQueue = [];
        this.processingBatch = false;
        this.processedFolders = new Set();
        // 改用布局就绪事件初始化观察器
        this.plugin.app.workspace.onLayoutReady(() => {
            this.setupFileExplorerObserver();
            this.setupVaultEventListeners();
            this.updateAllFilesDisplay();
        });
    }

    // 设置文件资源管理器的DOM观察器，监听文件资源管理器的变化
    private setupFileExplorerObserver(): void {
        // 创建一个MutationObserver实例来监听DOM变化
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
        
        // 设置定期更新，间隔更长以减少资源消耗
        // 仅作为备用机制，确保视图最终一致
        if (this.updateTimer === null) {
            this.updateTimer = window.setInterval(() => {
                // 使用完整更新作为兜底机制，确保视图一致性
                this.updateAllFilesDisplay(false);
            }, 60000); // 延长到60秒
        }
    }

    // 新增：设置 Vault 事件监听器
    private setupVaultEventListeners(): void {
        // 监听文件创建事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('create', (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    // 更新单个文件的显示
                    this.processFile(file);
                    this.updateFileExplorerDisplay(file);
                }
            })
        );

        // 监听文件修改事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('modify', (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    // 清除该文件的缓存，强制重新处理
                    this.fileDisplayCache.delete(file.path);
                    this.processedFiles.delete(file.path);
                    this.processFile(file);
                    this.updateFileExplorerDisplay(file);
                }
            })
        );

        // 监听文件重命名事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
                if (file instanceof TFile) {
                    // 清除旧路径的缓存
                    this.fileDisplayCache.delete(oldPath);
                    this.processedFiles.delete(oldPath);
                    // 处理新路径
                    this.processFile(file);
                    this.updateFileExplorerDisplay(file);
                }
            })
        );

        // 监听文件删除事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('delete', (file: TAbstractFile) => {
                // 从缓存中移除已删除的文件
                this.fileDisplayCache.delete(file.path);
                this.processedFiles.delete(file.path);
                this.originalDisplayNames.delete(file.path);
            })
        );
    }

    // 开始观察文件资源管理器
    private startObserving(): void {
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        
        fileExplorers.forEach((explorer) => {
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
        });
    }

    // 停止观察文件资源管理器
    private stopObserving(): void {
        if (this.fileExplorerObserver) {
            this.fileExplorerObserver.disconnect();
        }
        
        if (this.updateTimer !== null) {
            window.clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    // 新增：检查文件是否在指定的生效目录中
    private isFileInEnabledFolder(file: TFile): boolean {
        // 如果没有指定生效目录，则对所有文件生效
        if (!this.plugin.settings.enabledFolders || this.plugin.settings.enabledFolders.length === 0) {
            return true;
        }
        
        // 获取文件的规范化路径
        const filePath = normalizePath(file.path);
        
        // 检查文件是否在任一指定的生效目录中
        return this.plugin.settings.enabledFolders.some(folder => {
            const normalizedFolder = normalizePath(folder);
            // 检查文件路径是否以文件夹路径开头，或者文件夹路径是否为空（表示根目录）
            return normalizedFolder === '' || filePath === normalizedFolder || 
                   filePath.startsWith(normalizedFolder + '/');
        });
    }

    // 修改processFile方法，添加目录检查
    private processFile(file: TFile): FileDisplayResult {
        // 检查文件是否在指定的生效目录中
        if (!this.isFileInEnabledFolder(file)) {
            // 如果不在生效目录中，返回原始文件名
            return { 
                success: true, 
                displayName: file.basename 
            };
        }
        
        // 如果缓存中有此文件的处理结果，直接返回
        if (this.fileDisplayCache.has(file.path)) {
            return { 
                success: true, 
                displayName: this.fileDisplayCache.get(file.path) 
            };
        }
        
        // 使用metadataCache获取文件元数据，而不是直接解析文件名
        const result = this.getDisplayNameFromMetadata(file);
        if (result.success && result.displayName) {
            this.fileDisplayCache.set(file.path, result.displayName);
            this.processedFiles.add(file.path);
        }
        return result;
    }

    // 新增：从元数据获取显示名称
    private getDisplayNameFromMetadata(file: TFile): FileDisplayResult {
        try {
            // 获取文件的缓存元数据
            const metadata = this.plugin.app.metadataCache.getFileCache(file);
            
            // 使用文件名作为基础数据
            let baseText = file.basename;
            let fromFrontmatter = false;
            
            // 如果启用了YAML前置元数据标题功能，并且文件有元数据标题
            if (this.plugin.settings.useYamlTitleWhenAvailable && 
                metadata?.frontmatter && 
                'title' in metadata.frontmatter) {
                
                baseText = String(metadata.frontmatter.title);
                fromFrontmatter = true;
                
                // 如果配置为优先使用元数据标题，直接返回
                if (this.plugin.settings.preferFrontmatterTitle) {
                    return { success: true, displayName: baseText };
                }
            }
            
            // 如果未从前置元数据获取标题，或者配置为不优先使用元数据标题
            if (!fromFrontmatter || !this.plugin.settings.preferFrontmatterTitle) {
                // 应用正则提取文件名
                const regexResult = this.extractDisplayName(file.basename);
                
                // 如果正则提取成功，使用提取结果
                if (regexResult.success && regexResult.displayName) {
                    return regexResult;
                }
            }
            
            // 如果上述都没有匹配到，但有从前置元数据获取的标题，使用该标题
            if (fromFrontmatter) {
                return { success: true, displayName: baseText };
            }
            
            // 最后的后备选项：使用原始文件名
            return { 
                success: true, 
                displayName: file.basename 
            };
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return { 
                success: false, 
                error: `元数据处理错误: ${error}`,
                displayName: file.basename 
            };
        }
    }

    private extractDisplayName(filename: string): FileDisplayResult {
        try {
            const regex = new RegExp(this.plugin.settings.pattern);
            const match = filename.match(regex);
            if (match && match[1]) {
                return { success: true, displayName: match[1] };
            }
            if (match && match[0]) {
                return { success: true, displayName: match[0] };
            }
            return { 
                success: false, 
                error: '无法从文件名中提取显示文本',
                displayName: filename 
            };
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            new Notice(`正则表达式错误: ${error}`);
            return { 
                success: false, 
                error: `正则表达式错误: ${error}`,
                displayName: filename 
            };
        }
    }

    // 新增：只更新添加的节点
    private updateAddedNodes(nodes: Node[]): void {
        if (nodes.length === 0) return;
        
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        if (fileExplorers.length === 0) return;
        
        // 处理所有新添加的节点
        nodes.forEach(node => {
            if (node instanceof HTMLElement) {
                // 查找文件标题元素
                const titleElements = node.classList.contains('nav-file-title') 
                    ? [node.querySelector('.nav-file-title-content')] 
                    : Array.from(node.querySelectorAll('.nav-file-title-content'));
                
                titleElements.forEach(titleEl => {
                    if (!titleEl) return;
                    
                    const fileItem = titleEl.closest('.nav-file-title');
                    if (!fileItem) return;
                    
                    const path = fileItem.getAttribute('data-path');
                    if (!path) return;
                    
                    // 查找对应的文件
                    const file = this.plugin.app.vault.getAbstractFileByPath(path);
                    if (file instanceof TFile) {
                        // 更新单个文件显示
                        this.updateFileElement(titleEl as HTMLElement, file);
                    }
                });
            }
        });
    }

    // 修改：更新单个文件元素的显示
    private updateFileElement(titleEl: HTMLElement, file: TFile): void {
        // 保存原始显示名称，用于插件卸载时恢复
        if (!this.originalDisplayNames.has(file.path)) {
            this.originalDisplayNames.set(file.path, titleEl.textContent || '');
        }
        
        // 检查文件是否在指定的生效目录中
        if (!this.isFileInEnabledFolder(file)) {
            // 如果不在生效目录中，使用原始文件名
            titleEl.textContent = file.basename;
            titleEl.removeClass('filename-display-error');
            titleEl.removeAttribute('aria-label');
            return;
        }
        
        // 使用缓存或处理文件
        let result: FileDisplayResult;
        if (this.fileDisplayCache.has(file.path)) {
            const displayName = this.fileDisplayCache.get(file.path);
            result = { success: true, displayName };
        } else {
            result = this.processFile(file);
        }
        
        // 更新DOM
        titleEl.textContent = result.displayName || '';
        
        if (!result.success) {
            titleEl.addClass('filename-display-error');
            titleEl.setAttribute('aria-label', result.error || '未知错误');
        } else {
            titleEl.removeClass('filename-display-error');
            titleEl.removeAttribute('aria-label');
        }
    }

    updateFileExplorerDisplay(file: TFile): void {
        // 使用workspace API获取文件资源管理器视图
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        
        fileExplorers.forEach((explorer) => {
            if (!explorer.view || !explorer.view.containerEl) return;
            
            // 获取视图中的文件元素
            const fileItem = explorer.view.containerEl.querySelector(`.nav-file-title[data-path="${CSS.escape(file.path)}"]`);
            
            if (fileItem) {
                const titleEl = fileItem.querySelector('.nav-file-title-content');
                if (titleEl) {
                    this.updateFileElement(titleEl as HTMLElement, file);
                }
            }
        });
    }

    public updateAllFilesDisplay(clearCache: boolean = true): void {
        // 使用workspace API获取文件资源管理器
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        if (fileExplorers.length === 0) return;

        if (clearCache) {
            this.fileDisplayCache.clear();
            this.processedFiles.clear();
        }

        // 使用工作区API获取所有可见文件
        const files = this.getVisibleFiles();
        this.addToProcessQueue(files);
    }

    private getVisibleFiles(): TFile[] {
        // 获取用户可见的文件
        const openFiles = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file 
            ? [this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file] 
            : [];
        
        // 获取当前打开文件夹中的所有文件
        const explorerFiles = this.plugin.app.vault.getMarkdownFiles();
        
        // 返回所有可见文件的唯一集合
        const uniqueFiles = Array.from(new Set([
            ...openFiles.filter((file): file is TFile => file instanceof TFile), 
            ...explorerFiles
        ]));
        return uniqueFiles;
    }

    private getFileExplorer(): HTMLElement | null {
        // 使用workspace API获取文件资源管理器视图
        const explorer = this.plugin.app.workspace.getLeavesOfType('file-explorer')[0];
        return explorer?.view?.containerEl || null;
    }

    private getFileExplorerItems(explorer: HTMLElement): HTMLElement[] {
        return Array.from(explorer.querySelectorAll('.nav-file-title'));
    }

    restoreAllDisplayNames(): void {
        this.stopObserving();
        
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        
        fileExplorers.forEach((explorer) => {
            const items = Array.from(explorer.view.containerEl.querySelectorAll('.nav-file-title'));
            
            items.forEach(item => {
                const path = item.getAttribute('data-path');
                if (path && this.originalDisplayNames.has(path)) {
                    const titleEl = item.querySelector('.nav-file-title-content');
                    if (titleEl) {
                        const originalName = this.originalDisplayNames.get(path);
                        titleEl.textContent = originalName || '';
                        titleEl.removeClass('filename-display-error');
                        titleEl.removeAttribute('aria-label');
                    }
                }
            });
        });
        
        this.originalDisplayNames.clear();
        this.fileExplorerCache = new WeakMap();
        this.fileDisplayCache.clear();
        this.processedFiles.clear();
    }

    // 重置观察器，用于布局变更后重新开始观察
    resetObservers(): void {
        this.stopObserving();
        this.setupFileExplorerObserver();
        // 不需要在这里立即更新所有文件显示，因为setupFileExplorerObserver会自动处理
    }

    private setupFolderObserver() {
        const fileExplorer = this.getFileExplorer();
        if (!fileExplorer) return;

        const folderObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target as HTMLElement;
                    if (target.classList.contains('is-collapsed')) {
                        this.onFolderCollapse(target);
                    } else {
                        this.onFolderExpand(target);
                    }
                }
            });
        });

        folderObserver.observe(fileExplorer, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    private onFolderExpand(folderElement: HTMLElement) {
        const folderPath = this.getFolderPath(folderElement);
        if (!this.processedFolders.has(folderPath)) {
            const files = this.getFilesInFolder(folderPath);
            this.addToProcessQueue(files);
            this.processedFolders.add(folderPath);
        }
    }

    private onFolderCollapse(folderElement: HTMLElement) {
        const folderPath = this.getFolderPath(folderElement);
        this.processedFolders.delete(folderPath);
    }

    private getFolderPath(element: HTMLElement): string {
        // 从DOM元素获取文件夹路径
        const titleEl = element.querySelector('.nav-folder-title-content');
        return titleEl ? titleEl.textContent || '' : '';
    }

    private getFilesInFolder(folderPath: string): TFile[] {
        return this.plugin.app.vault.getFiles().filter(file => 
            file.path.startsWith(folderPath + '/')
        );
    }

    private addToProcessQueue(files: TFile[]) {
        this.processQueue.push(...files);
        if (!this.processingBatch) {
            this.processBatch();
        }
    }

    private async processBatch() {
        if (this.processQueue.length === 0) {
            this.processingBatch = false;
            return;
        }

        this.processingBatch = true;
        const batch = this.processQueue.splice(0, this.batchSize);

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => {
                this.processBatchItems(batch);
            });
        } else {
            await this.processBatchItems(batch);
        }
    }

    private async processBatchItems(files: TFile[]) {
        for (const file of files) {
            await this.updateFileExplorerDisplay(file);
        }
        
        if (this.processQueue.length > 0) {
            this.processBatch();
        } else {
            this.processingBatch = false;
        }
    }
} 