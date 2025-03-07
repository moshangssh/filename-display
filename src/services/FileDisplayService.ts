import { Notice, TFile } from 'obsidian';
import type { FilenameDisplaySettings, IFilenameDisplayPlugin, FileDisplayResult } from '../types';

export class FileDisplayService {
    private originalDisplayNames: Map<string, string> = new Map();
    private plugin: IFilenameDisplayPlugin;
    private fileExplorerCache: WeakMap<Element, Element[]> = new WeakMap();
    private fileExplorerObserver: MutationObserver | null = null;
    private updateTimer: number | null = null;

    constructor(plugin: IFilenameDisplayPlugin) {
        this.plugin = plugin;
        this.setupFileExplorerObserver();
    }

    // 设置文件资源管理器的DOM观察器，监听文件资源管理器的变化
    private setupFileExplorerObserver(): void {
        // 创建一个MutationObserver实例来监听DOM变化
        this.fileExplorerObserver = new MutationObserver((mutations) => {
            // 如果发现相关变化，更新文件显示
            let shouldUpdate = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    shouldUpdate = true;
                    break;
                }
            }
            if (shouldUpdate) {
                this.updateAllFilesDisplay();
            }
        });

        // 延迟启动观察器，确保Obsidian完全加载
        setTimeout(() => {
            this.startObserving();
            // 初始化更新
            this.updateAllFilesDisplay();
            
            // 设置定期更新，以处理可能的更新丢失情况
            if (this.updateTimer === null) {
                this.updateTimer = window.setInterval(() => {
                    this.updateAllFilesDisplay();
                }, 5000); // 每5秒刷新一次，确保视图始终最新
            }
        }, 2000); // 延迟2秒，等待Obsidian完全加载
    }

    // 开始观察文件资源管理器
    private startObserving(): void {
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        
        fileExplorers.forEach((explorer) => {
            const container = explorer.view.containerEl;
            if (container) {
                this.fileExplorerObserver?.observe(container, {
                    childList: true,
                    subtree: true,
                    attributes: false,
                    characterData: false
                });
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

    private getFileExplorerItems(explorer: Element): Element[] {
        // 尝试从缓存中获取项目
        if (this.fileExplorerCache.has(explorer)) {
            const cachedItems = this.fileExplorerCache.get(explorer)!;
            // 检查缓存项目是否仍然有效（仍然在DOM中）
            if (cachedItems.length > 0 && document.contains(cachedItems[0])) {
                return cachedItems;
            }
        }
        
        // 如果缓存无效或不存在，重新查询DOM
        const items = Array.from(explorer.querySelectorAll('.nav-file-title'));
        
        if (items.length > 0) {
            // 只有当找到项目时才更新缓存
            this.fileExplorerCache.set(explorer, items);
        }
        
        return items;
    }

    updateFileExplorerDisplay(file: TFile): void {
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        
        fileExplorers.forEach((explorer) => {
            const items = this.getFileExplorerItems(explorer.view.containerEl);
            const fileItem = items.find(item => item.getAttribute('data-path') === file.path);
            
            if (fileItem) {
                const titleEl = fileItem.querySelector('.nav-file-title-content');
                if (titleEl) {
                    if (!this.originalDisplayNames.has(file.path)) {
                        this.originalDisplayNames.set(file.path, titleEl.textContent || '');
                    }
                    const result = this.extractDisplayName(file.basename);
                    titleEl.textContent = result.displayName || '';
                    
                    if (!result.success) {
                        titleEl.addClass('filename-display-error');
                        titleEl.setAttribute('aria-label', result.error || '未知错误');
                    } else {
                        titleEl.removeClass('filename-display-error');
                        titleEl.removeAttribute('aria-label');
                    }
                }
            }
        });
    }

    updateAllFilesDisplay(): void {
        // 清除缓存
        this.fileExplorerCache = new WeakMap();
        
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        if (fileExplorers.length === 0) {
            // 如果没有找到文件资源管理器，可能是还没有完全加载
            // 稍后再尝试
            setTimeout(() => this.updateAllFilesDisplay(), 500);
            return;
        }
        
        const files = this.plugin.app.vault.getFiles();
        
        fileExplorers.forEach(explorer => {
            // 确保explorer.view和containerEl存在
            if (!explorer.view || !explorer.view.containerEl) {
                return;
            }
            
            const items = this.getFileExplorerItems(explorer.view.containerEl);
            if (items.length === 0) {
                // 如果没有找到文件项，可能文件资源管理器正在加载
                // 不做任何操作，等待下一次MutationObserver或定时器触发更新
                return;
            }
            
            files.forEach(file => {
                const fileItem = items.find(item => item.getAttribute('data-path') === file.path);
                if (fileItem) {
                    const titleEl = fileItem.querySelector('.nav-file-title-content');
                    if (titleEl) {
                        if (!this.originalDisplayNames.has(file.path)) {
                            this.originalDisplayNames.set(file.path, titleEl.textContent || '');
                        }
                        const result = this.extractDisplayName(file.basename);
                        titleEl.textContent = result.displayName || '';
                        
                        if (!result.success) {
                            titleEl.addClass('filename-display-error');
                            titleEl.setAttribute('aria-label', result.error || '未知错误');
                        } else {
                            titleEl.removeClass('filename-display-error');
                            titleEl.removeAttribute('aria-label');
                        }
                    }
                }
            });
        });
    }

    restoreAllDisplayNames(): void {
        this.stopObserving();
        
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        
        fileExplorers.forEach((explorer) => {
            const items = this.getFileExplorerItems(explorer.view.containerEl);
            
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
    }

    // 重置观察器，用于布局变更后重新开始观察
    resetObservers(): void {
        this.stopObserving();
        this.setupFileExplorerObserver();
    }
} 