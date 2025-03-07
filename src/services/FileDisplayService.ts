import { Notice, TFile } from 'obsidian';
import type { FilenameDisplaySettings, IFilenameDisplayPlugin, FileDisplayResult } from '../types';

export class FileDisplayService {
    private originalDisplayNames: Map<string, string> = new Map();
    private plugin: IFilenameDisplayPlugin;
    private fileExplorerCache: WeakMap<Element, Element[]> = new WeakMap();

    constructor(plugin: IFilenameDisplayPlugin) {
        this.plugin = plugin;
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
        if (this.fileExplorerCache.has(explorer)) {
            return this.fileExplorerCache.get(explorer)!;
        }
        const items = Array.from(explorer.querySelectorAll('.nav-file-title'));
        this.fileExplorerCache.set(explorer, items);
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
        const files = this.plugin.app.vault.getFiles();
        
        fileExplorers.forEach(explorer => {
            const items = this.getFileExplorerItems(explorer.view.containerEl);
            
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
} 