import { TFile } from 'obsidian';
import type { IFilenameDisplayPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';
import { FileExplorerObserver } from './FileExplorerObserver';

export class FileExplorerDisplayService {
    private plugin: IFilenameDisplayPlugin;
    private filenameParser: FilenameParser;
    private fileDisplayCache: FileDisplayCache;
    private fileExplorerObserver: FileExplorerObserver;

    constructor(
        plugin: IFilenameDisplayPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: FileDisplayCache,
        updateAllFilesFn: () => void,
        updateSingleFileFn: (file: TFile) => Promise<void>,
        updateAddedNodesFn: (nodes: Node[]) => void
    ) {
        this.plugin = plugin;
        this.filenameParser = filenameParser;
        this.fileDisplayCache = fileDisplayCache;
        
        // 初始化文件资源管理器观察器
        this.fileExplorerObserver = new FileExplorerObserver(
            plugin,
            updateAllFilesFn,
            updateSingleFileFn,
            updateAddedNodesFn
        );
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
                        const titleEl = fileEl.querySelector('.nav-file-title-content');
                        if (titleEl) {
                            this.updateFileElement(titleEl as HTMLElement, file);
                        }
                    }
                }
            }
        }
    }
    
    // 更新文件元素显示
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
        if (processResult.success && processResult.displayName) {
            titleEl.textContent = processResult.displayName;
            titleEl.removeClass('filename-display-error');
            
            // 如果显示名称与实际文件名不同，设置工具提示
            if (processResult.displayName !== file.basename) {
                titleEl.setAttribute('aria-label', file.basename);
            } else {
                titleEl.removeAttribute('aria-label');
            }
        } else {
            // 如果处理出错，显示错误样式
            titleEl.addClass('filename-display-error');
            if (processResult.error) {
                titleEl.setAttribute('aria-label', processResult.error);
            }
        }
    }
    
    // 恢复单个元素的显示名称
    public restoreDisplayName(titleEl: HTMLElement): void {
        // 首先尝试从 WeakMap 中获取信息
        const elementData = this.fileDisplayCache.getElementData(titleEl);
        if (elementData) {
            titleEl.textContent = elementData.originalName;
            return;
        }
        
        // 如果 WeakMap 中没有，回退到使用 path 属性查找
        const filePath = titleEl.getAttribute('data-path');
        if (filePath) {
            const originalName = this.fileDisplayCache.getOriginalName(filePath);
            if (originalName) {
                titleEl.textContent = originalName;
            }
        }
    }
    
    // 更新文件资源管理器中的文件显示
    public async updateFileExplorerDisplay(file: TFile): Promise<void> {
        // 使用工作区API获取文件资源管理器
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        if (fileExplorers.length === 0) return;
        
        // 遍历所有文件资源管理器
        fileExplorers.forEach((explorer) => {
            // 查找与文件路径匹配的元素
            const fileItem = explorer.view.containerEl.querySelector(`.nav-file-title[data-path="${file.path}"]`);
            if (fileItem) {
                const titleEl = fileItem.querySelector('.nav-file-title-content');
                if (titleEl) {
                    this.updateFileElement(titleEl as HTMLElement, file);
                }
            }
        });
    }
    
    // 恢复所有原始显示名称
    public restoreAllDisplayNames(): void {
        this.fileExplorerObserver.stopObserving();
        
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        const originalNames = this.fileDisplayCache.getAllOriginalNames();
        
        fileExplorers.forEach((explorer) => {
            const items = Array.from(explorer.view.containerEl.querySelectorAll('.nav-file-title'));
            
            items.forEach(item => {
                const titleEl = item.querySelector('.nav-file-title-content');
                if (titleEl) {
                    // 首先尝试使用 WeakMap 恢复
                    const elementData = this.fileDisplayCache.getElementData(titleEl as HTMLElement);
                    if (elementData) {
                        titleEl.textContent = elementData.originalName;
                        titleEl.removeClass('filename-display-error');
                        titleEl.removeAttribute('aria-label');
                        return;
                    }
                    
                    // 如果 WeakMap 中没有，回退到使用 path 属性
                    const path = item.getAttribute('data-path');
                    if (path && originalNames.has(path)) {
                        const originalName = originalNames.get(path);
                        titleEl.textContent = originalName || '';
                        titleEl.removeClass('filename-display-error');
                        titleEl.removeAttribute('aria-label');
                    }
                }
            });
        });
    }
    
    // 重置观察器
    public resetObservers(): void {
        this.fileExplorerObserver.stopObserving();
        this.fileExplorerObserver.setupObservers();
    }
    
    // 初始化文件资源管理器观察器
    public setupObservers(): void {
        this.fileExplorerObserver.setupObservers();
    }
    
    // 处理文件以获取显示名称
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
                    displayName: cachedName
                };
            }
        }

        // 使用metadataCache获取文件元数据，处理文件名
        const result = this.filenameParser.getDisplayNameFromMetadata(file);
        if (result.success && result.displayName) {
            this.fileDisplayCache.setDisplayName(file.path, result.displayName);
        }
        return result;
    }
} 