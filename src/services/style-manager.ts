import { TFile } from 'obsidian';
import { StyleManager, FileProcessor } from '../types/interfaces';

export class DefaultStyleManager implements StyleManager {
    private styleEl: HTMLStyleElement | null = null;
    private cssRulesCache: Map<string, string> = new Map();

    constructor(private fileProcessor: FileProcessor) {
        this.initializeStyleElement();
    }

    private initializeStyleElement(): void {
        if (!this.styleEl) {
            this.styleEl = document.createElement('style');
            document.head.appendChild(this.styleEl);
        }
    }

    updateStyles(files: TFile[]): void {
        const newRulesMap = new Map<string, string>();
        
        for (const file of files) {
            const cssRule = this.generateCssRule(file);
            if (cssRule) {
                newRulesMap.set(file.path, cssRule);
                
                // 设置显示名称
                const elements = document.querySelectorAll(`[data-path="${CSS.escape(file.path)}"] .nav-file-title-content, 
                    .workspace-tab-header[data-path="${CSS.escape(file.path)}"] .workspace-tab-header-inner-title,
                    .view-header[data-path="${CSS.escape(file.path)}"] .view-header-title,
                    .tree-item[data-path="${CSS.escape(file.path)}"] .tree-item-inner`);
                    
                elements.forEach(el => {
                    if (el instanceof HTMLElement) {
                        const displayName = this.fileProcessor.getUpdatedFileName(file.basename) || file.basename;
                        el.setAttribute('data-display-name', displayName);
                    }
                });
            }
        }

        this.applyStyles(newRulesMap);
    }

    clearStyles(): void {
        if (this.styleEl) {
            this.styleEl.textContent = '';
        }
        this.cssRulesCache.clear();
    }

    private generateCssRule(file: TFile): string {
        const escapedPath = CSS.escape(file.path);
        return `
            [data-path="${escapedPath}"] .nav-file-title-content {
                color: transparent;
                position: relative;
            }
            [data-path="${escapedPath}"] .nav-file-title-content::before {
                content: attr(data-display-name);
                position: absolute;
                left: 0;
                color: var(--nav-item-color);
                pointer-events: none;
            }
            
            .workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title {
                color: transparent;
                position: relative;
            }
            .workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title::before {
                content: attr(data-display-name);
                position: absolute;
                left: 0;
                color: var(--tab-text-color);
                pointer-events: none;
            }
            
            .view-header[data-path="${escapedPath}"] .view-header-title {
                color: transparent;
                position: relative;
            }
            .view-header[data-path="${escapedPath}"] .view-header-title::before {
                content: attr(data-display-name);
                position: absolute;
                left: 0;
                color: var(--header-title-color);
                pointer-events: none;
            }
            
            .tree-item[data-path="${escapedPath}"] .tree-item-inner {
                color: transparent;
                position: relative;
            }
            .tree-item[data-path="${escapedPath}"] .tree-item-inner::before {
                content: attr(data-display-name);
                position: absolute;
                left: 0;
                color: var(--text-normal);
                pointer-events: none;
            }
        `;
    }

    private applyStyles(newRulesMap: Map<string, string>): void {
        let hasChanges = false;

        newRulesMap.forEach((rule, path) => {
            if (this.cssRulesCache.get(path) !== rule) hasChanges = true;
        });

        if (hasChanges) {
            const cssContent = Array.from(newRulesMap.values()).join('\n');
            if (this.styleEl) {
                this.styleEl.textContent = cssContent;
            }
            this.cssRulesCache = newRulesMap;
        }
    }
}
