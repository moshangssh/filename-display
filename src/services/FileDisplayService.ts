import { TFile, TAbstractFile, MarkdownView } from 'obsidian';
import type { IFilenameDisplayPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';
import { FileExplorerObserver } from './FileExplorerObserver';
import { BatchProcessor } from './BatchProcessor';

// 主服务类，协调其他组件
export class FileDisplayService {
    private plugin: IFilenameDisplayPlugin;
    private filenameParser: FilenameParser;
    private fileDisplayCache: FileDisplayCache;
    private fileExplorerObserver: FileExplorerObserver;
    private batchProcessor: BatchProcessor;
    private updateTimer: number | null = null;

    constructor(plugin: IFilenameDisplayPlugin) {
        this.plugin = plugin;
        this.filenameParser = new FilenameParser(plugin);
        this.fileDisplayCache = new FileDisplayCache();
        
        // 初始化组件
        this.fileExplorerObserver = new FileExplorerObserver(
            plugin,
            () => this.updateAllFilesDisplay(),
            (file) => this.updateFileExplorerDisplay(file),
            (nodes) => this.updateAddedNodes(nodes)
        );
        
        this.batchProcessor = new BatchProcessor(
            async (file) => this.updateFileExplorerDisplay(file),
            50
        );
        
        // 改用布局就绪事件初始化
        this.plugin.app.workspace.onLayoutReady(() => {
            this.fileExplorerObserver.setupObservers();
            this.setupVaultEventListeners();
            this.setupMetadataEventListeners();
            this.updateAllFilesDisplay();
        });
    }
    
    // 设置Vault事件监听器
    private setupVaultEventListeners(): void {
        // 监听文件创建事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('create', (file: TAbstractFile) => {
                if (file instanceof TFile) {
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
                    this.fileDisplayCache.deletePath(file.path);
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
                    this.fileDisplayCache.deletePath(oldPath);
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
                this.fileDisplayCache.deletePath(file.path);
            })
        );
    }
    
    // 设置元数据事件监听器
    private setupMetadataEventListeners(): void {
        // 监听元数据缓存变更
        this.plugin.registerEvent(
            this.plugin.app.metadataCache.on('changed', (file) => {
                if (file instanceof TFile) {
                    // 检查是否需要更新显示
                    const metadata = this.plugin.app.metadataCache.getFileCache(file);
                    if (metadata?.frontmatter && 'title' in metadata.frontmatter) {
                        this.updateFileExplorerDisplay(file);
                    }
                }
            })
        );
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
    
    // 更新新添加的节点
    private updateAddedNodes(nodes: Node[]): void {
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
    private updateFileElement(titleEl: HTMLElement, file: TFile): void {
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
    private restoreDisplayName(titleEl: HTMLElement): void {
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
    
    // 更新所有文件的显示
    public updateAllFilesDisplay(clearCache: boolean = true): void {
        // 使用workspace API获取文件资源管理器
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        if (fileExplorers.length === 0) return;

        // 根据参数决定是清除所有缓存还是只清除过期缓存
        if (clearCache) {
            this.fileDisplayCache.clearAll();
        } else {
            this.fileDisplayCache.clearExpired();
        }

        // 获取所有可见的、在启用目录中的文件
        const files = this.getVisibleFiles()
            .filter(file => this.filenameParser.isFileInEnabledFolder(file));
        
        // 批量处理文件
        if (files.length > 0) {
            this.batchProcessor.addToProcessQueue(files);
        }
    }
    
    // 获取可见文件
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
    
    // 恢复所有原始显示名称
    public restoreAllDisplayNames(): void {
        this.fileExplorerObserver.stopObserving();
        
        if (this.updateTimer) {
            window.clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
        
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
    
    // 获取缓存实例
    public getCache(): FileDisplayCache {
        return this.fileDisplayCache;
    }
} 