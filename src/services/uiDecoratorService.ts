import { App, TFile } from 'obsidian';
import { ViewPlugin, DecorationSet, Decoration, EditorView, ViewUpdate, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { FilenameDecorationWidget } from '../ui/filenameWidget';
import { VisibilityTracker, VisibleElement } from './legacyAdapters';
import { NameTransformer } from './nameTransformer';
import { CacheService } from './cacheService';
import { createGlobalStyles } from '../styles/widgetStyles';
import { DOMUtils } from '../utils/domUtils';

/**
 * UI装饰器配置接口
 */
export interface UIDecoratorConfig {
    showOriginalNameOnHover: boolean;
}

/**
 * UI装饰器服务接口
 */
export interface UIDecorator {
    applyDecorations(): void;
    clearDecorations(): void;
    destroy(): void;
}

/**
 * UI装饰器服务基类
 * 处理DOM元素的装饰
 */
export abstract class UIDecoratorService implements UIDecorator {
    protected app: App;
    protected config: UIDecoratorConfig;
    protected nameTransformer: NameTransformer;
    protected nameCache: CacheService<string, string>;
    protected styleEl: HTMLStyleElement | null = null;
    
    constructor(app: App, config: UIDecoratorConfig, nameTransformer: NameTransformer) {
        this.app = app;
        this.config = { ...config };
        this.nameTransformer = nameTransformer;
        this.nameCache = new CacheService<string, string>(500);
        this.createStyleElement();
    }
    
    /**
     * 创建基础样式元素
     */
    protected createStyleElement(): void {
        if (!this.styleEl) {
            this.styleEl = createGlobalStyles();
            document.head.appendChild(this.styleEl);
        }
    }
    
    /**
     * 更新配置
     */
    public updateConfig(config: Partial<UIDecoratorConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 从缓存获取或转换文件名
     */
    protected getDisplayName(originalName: string): string | null {
        // 先查缓存
        const cached = this.nameCache.get(originalName);
        if (cached) {
            return cached;
        }
        
        // 转换名称
        const transformed = this.nameTransformer.transformFileName(originalName);
        
        // 缓存结果
        if (transformed) {
            this.nameCache.set(originalName, transformed);
        }
        
        return transformed;
    }
    
    /**
     * 查找原始文件名
     */
    public findOriginalName(displayName: string): string | null {
        for (const key of this.nameCache.keys()) {
            const value = this.nameCache.get(key);
            if (value === displayName) {
                return key;
            }
        }
        return null;
    }
    
    /**
     * 清除名称映射
     */
    public clearNameCache(): void {
        this.nameCache.clear();
    }
    
    /**
     * 应用装饰（子类实现）
     */
    public abstract applyDecorations(): void;
    
    /**
     * 清除装饰（子类实现）
     */
    public abstract clearDecorations(): void;
    
    /**
     * 销毁服务（子类实现）
     */
    public abstract destroy(): void;
}

/**
 * 文件资源管理器装饰器
 * 处理文件资源管理器中的文件名装饰
 */
export class FileExplorerDecorator extends UIDecoratorService {
    private observer: MutationObserver | null = null;
    
    constructor(app: App, config: UIDecoratorConfig, nameTransformer: NameTransformer) {
        super(app, config, nameTransformer);
        this.setupFileExplorerObserver();
    }
    
    /**
     * 设置文件资源管理器观察器
     */
    private setupFileExplorerObserver(): void {
        // 创建突变观察器配置
        const config = { 
            childList: true, 
            subtree: true 
        };
        
        // 创建观察器实例
        this.observer = new MutationObserver((mutations) => {
            let fileElementsChanged = false;
            
            // 检查是否有文件元素添加或移除
            for (const mutation of mutations) {
                if (mutation.target && (
                    (mutation.target as HTMLElement).classList?.contains('nav-folder-children') ||
                    (mutation.target as HTMLElement).classList?.contains('nav-file-title')
                )) {
                    fileElementsChanged = true;
                    break;
                }
            }
            
            // 如果文件元素发生变化，处理文件面板
            if (fileElementsChanged) {
                this.processFilesPanel();
            }
        });
        
        // 延迟启动观察器，确保DOM已准备好
        setTimeout(() => {
            const fileExplorer = document.querySelector('.nav-files-container');
            if (fileExplorer && this.observer) {
                this.observer.observe(fileExplorer, config);
                this.processFilesPanel(); // 初始处理
            }
        }, 300);
    }
    
    /**
     * 处理文件面板中的所有文件
     */
    private processFilesPanel(): void {
        // 获取所有文件标题元素
        const fileTitleEls = document.querySelectorAll('.nav-file-title');
        if (!fileTitleEls.length) return;
        
        // 处理每个文件标题
        fileTitleEls.forEach((el) => {
            const titleEl = el as HTMLElement;
            const titleInnerEl = titleEl.querySelector('.nav-file-title-content');
            
            if (!titleInnerEl) return;
            
            // 获取原始文件名
            const originalText = titleInnerEl.textContent;
            if (!originalText) return;
            
            // 获取文件路径
            const filePath = titleEl.getAttribute('data-path');
            if (!filePath) return;
            
            // 转换文件名
            const displayName = this.getDisplayName(originalText);
            if (!displayName || displayName === originalText) return;
            
            // 更新文件元素显示
            this.updateFileElement(titleInnerEl as HTMLElement, originalText, displayName);
        });
    }
    
    /**
     * 更新单个文件元素的显示
     */
    private updateFileElement(element: HTMLElement, originalText: string, displayName: string): void {
        // 检查元素是否已有自定义属性
        if (element.hasAttribute('data-original-name')) {
            // 如果已经有相同的显示名称，不做处理
            if (element.textContent === displayName) {
                return;
            }
        }
        
        // 保存原始名称
        element.setAttribute('data-original-name', originalText);
        
        // 更新显示文本
        element.textContent = displayName;
        
        // 添加提示显示
        if (this.config.showOriginalNameOnHover) {
            element.setAttribute('title', originalText);
        }
    }
    
    /**
     * 应用装饰到多个文件
     */
    public applyDecorations(): void {
        this.processFilesPanel();
    }
    
    /**
     * 清除所有装饰
     */
    public clearDecorations(): void {
        // 清除文件标题装饰
        const decoratedTitles = document.querySelectorAll('.nav-file-title-content[data-original-name]');
        
        decoratedTitles.forEach((el) => {
            const element = el as HTMLElement;
            const originalName = element.getAttribute('data-original-name');
            
            if (originalName) {
                element.textContent = originalName;
                element.removeAttribute('data-original-name');
                element.removeAttribute('title');
            }
        });
    }
    
    /**
     * 销毁装饰器
     */
    public destroy(): void {
        // 停止观察
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        // 清除装饰
        this.clearDecorations();
        
        // 移除样式
        if (this.styleEl) {
            this.styleEl.remove();
            this.styleEl = null;
        }
        
        // 清除缓存
        this.clearNameCache();
    }
}

/**
 * 编辑器装饰器
 * 处理编辑器中的链接装饰
 */
export class EditorDecorator extends UIDecoratorService {
    private visibilityTracker: VisibilityTracker;
    
    constructor(app: App, config: UIDecoratorConfig, nameTransformer: NameTransformer) {
        super(app, config, nameTransformer);
        
        // 创建可见性追踪器
        this.visibilityTracker = new VisibilityTracker(this.app);
        
        // 添加可见性变化监听
        this.visibilityTracker.addChangeListener((visibleElements: VisibleElement[]) => {
            this.handleVisibleElementsChange(visibleElements);
        });
    }
    
    /**
     * 处理可见元素变化
     */
    private handleVisibleElementsChange(visibleElements: VisibleElement[]): void {
        for (const element of visibleElements) {
            this.processElement(element);
        }
    }
    
    /**
     * 处理单个元素
     */
    private processElement(element: VisibleElement): void {
        try {
            // 获取元素的原始文本
            const originalText = element.element.textContent;
            if (!originalText) return;
            
            // 检查元素是否已处理
            if (element.element.hasAttribute('data-processed')) return;
            
            // 获取转换后的名称
            const displayName = this.getDisplayName(originalText);
            if (!displayName || displayName === originalText) return;
            
            // 更新元素显示
            this.updateElementDisplay(element.element, originalText, displayName);
            
            // 标记元素已处理
            element.element.setAttribute('data-processed', 'true');
        } catch (error) {
            console.error('处理元素失败:', error);
        }
    }
    
    /**
     * 更新元素显示
     */
    private updateElementDisplay(element: HTMLElement, originalText: string, newName: string): void {
        // 保存原始名称
        element.setAttribute('data-original-name', originalText);
        
        // 更新显示文本
        element.textContent = newName;
        
        // 添加提示显示
        if (this.config.showOriginalNameOnHover) {
            element.setAttribute('title', originalText);
        }
    }
    
    /**
     * 创建编辑器视图插件
     */
    public createEditorViewPlugin() {
        const nameTransformer = this.nameTransformer;
        const nameCache = this.nameCache;
        const config = this.config;
        
        return ViewPlugin.fromClass(
            class {
                decorations: DecorationSet;
                
                constructor(view: EditorView) {
                    this.decorations = this.buildDecorations(view);
                }
                
                update(update: ViewUpdate) {
                    if (update.docChanged || update.viewportChanged) {
                        this.decorations = this.buildDecorations(update.view);
                    }
                }
                
                buildDecorations(view: EditorView): DecorationSet {
                    const builder = new RangeSetBuilder<Decoration>();
                    
                    // 获取可见范围
                    const { from, to } = view.viewport;
                    
                    // 在DOM中查找所有内部链接
                    const links = view.dom.querySelectorAll('.cm-hmd-internal-link');
                    
                    for (let i = 0; i < links.length; i++) {
                        const link = links[i] as HTMLElement;
                        const originalText = link.textContent;
                        
                        if (!originalText) continue;
                        
                        // 获取链接对应的位置
                        const linkPos = view.posAtDOM(link);
                        
                        // 确保链接在可见范围内
                        if (linkPos >= from && linkPos <= to) {
                            // 获取转换后的名称
                            const displayName = nameCache.get(originalText) || 
                                               nameTransformer.transformFileName(originalText);
                            
                            // 如果有有效的显示名称，创建装饰
                            if (displayName && displayName !== originalText) {
                                // 缓存名称
                                nameCache.set(originalText, displayName);
                                
                                // 创建部件
                                const widget = new FilenameDecorationWidget(
                                    displayName, 
                                    originalText, 
                                    config.showOriginalNameOnHover
                                );
                                
                                // 添加到构建器
                                builder.add(
                                    linkPos, 
                                    linkPos + originalText.length, 
                                    Decoration.replace({ widget })
                                );
                            }
                        }
                    }
                    
                    return builder.finish();
                }
            },
            {
                decorations: v => v.decorations
            }
        );
    }
    
    /**
     * 应用装饰
     */
    public applyDecorations(): void {
        this.visibilityTracker.scanCurrentView();
    }
    
    /**
     * 清除装饰
     */
    public clearDecorations(): void {
        // 清除编辑器中的已处理元素
        const decoratedLinks = document.querySelectorAll('.cm-hmd-internal-link[data-processed]');
        
        decoratedLinks.forEach((el) => {
            const element = el as HTMLElement;
            const originalName = element.getAttribute('data-original-name');
            
            if (originalName) {
                element.textContent = originalName;
                element.removeAttribute('data-processed');
                element.removeAttribute('data-original-name');
                element.removeAttribute('title');
            }
        });
    }
    
    /**
     * 销毁装饰器
     */
    public destroy(): void {
        // 销毁可见性追踪器
        this.visibilityTracker.destroy();
        
        // 清除装饰
        this.clearDecorations();
        
        // 移除样式
        if (this.styleEl) {
            this.styleEl.remove();
            this.styleEl = null;
        }
        
        // 清除缓存
        this.clearNameCache();
    }
} 