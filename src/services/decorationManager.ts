import { ViewPlugin, DecorationSet, Decoration, EditorView, ViewUpdate, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { TFile, App } from 'obsidian';
import { RegexCache } from '../utils/regexCache';
import { EditorViewport, ViewportElement } from './editorViewport';
import { BaseWidget } from '../ui/linkWidget';
import { DOMUtils } from '../utils/domUtils';
import { createGlobalStyles } from '../styles/widgetStyles';
import { debounceFn } from '../utils/debounceIntegration';

/**
 * 文件名显示配置接口
 */
export interface DecorationManagerConfig {
    fileNamePattern: string;
    captureGroup: number;
    showOriginalNameOnHover: boolean;
}

/**
 * 链接部件类，显示替换后的文件名
 */
export class FilenameDecorationWidget extends BaseWidget {
    constructor(
        readonly displayText: string, 
        readonly originalText: string, 
        readonly showTooltip: boolean
    ) {
        super(displayText, originalText);
    }

    toDOM() {
        const container = this.createContainer('filename-decoration-widget');
        
        // 显示新名称
        const display = this.createDisplayElement('filename-display cm-hmd-internal-link');
        container.appendChild(display);

        // 根据设置决定是否添加提示
        if (this.showTooltip) {
            const tooltip = this.createTooltipElement('filename-tooltip');
            container.appendChild(tooltip);
        }

        return container;
    }

    eq(other: FilenameDecorationWidget): boolean {
        return other.displayText === this.displayText && 
               other.originalText === this.originalText &&
               other.showTooltip === this.showTooltip;
    }
}

/**
 * LRU缓存实现
 */
class LRUCache<K, V> {
    private cache: Map<K, V>;
    private timestamps: Map<K, number>;
    private readonly maxSize: number;
    private hits: number = 0;
    private misses: number = 0;
    
    constructor(maxSize: number) {
        this.maxSize = maxSize;
        this.cache = new Map();
        this.timestamps = new Map();
    }
    
    set(key: K, value: V): void {
        this.timestamps.set(key, Date.now());
        
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }
        
        this.cache.set(key, value);
    }
    
    get(key: K): V | null {
        const value = this.cache.get(key);
        if (value !== undefined) {
            this.hits++;
            this.timestamps.set(key, Date.now());
            return value;
        }
        this.misses++;
        return null;
    }
    
    private evictOldest(): void {
        let oldestKey: K | null = null;
        let oldestTime = Infinity;
        
        for (const [key, time] of this.timestamps) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.timestamps.delete(oldestKey);
        }
    }
    
    clear(): void {
        this.cache.clear();
        this.timestamps.clear();
        this.hits = 0;
        this.misses = 0;
    }
    
    getStats(): { hits: number; misses: number; hitRate: number } {
        const total = this.hits + this.misses;
        return {
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? this.hits / total : 0
        };
    }
}

/**
 * 文件名装饰管理器
 * 使用CodeMirror 6 Decoration系统来管理文件名显示
 */
export class DecorationManager {
    private config: DecorationManagerConfig;
    private readonly nameCache: LRUCache<string, string>;
    private styleEl: HTMLStyleElement | null = null;
    private editorViewport: EditorViewport | null = null;
    private app: App;
    private readonly CLEANUP_INTERVAL = 1000 * 60 * 5; // 5分钟清理一次
    private cleanupTimer: NodeJS.Timeout | null = null;
    
    // 性能监控
    private metrics = {
        totalProcessed: 0,
        lastBatchSize: 0,
        lastProcessTime: 0,
        avgProcessTime: 0
    };
    
    constructor(app: App, config: DecorationManagerConfig) {
        this.app = app;
        this.config = { ...config };
        this.nameCache = new LRUCache<string, string>(1000);
        
        this.createStyleElement();
        this.setupEditorViewport();
        this.setupPeriodicCleanup();
        
        // 延迟初始化文件浏览器
        setTimeout(() => {
            this.setupFileExplorerObserver();
        }, 300);
    }
    
    /**
     * 设置编辑器视口监听
     */
    private setupEditorViewport(): void {
        // 创建视口管理器
        this.editorViewport = new EditorViewport(this.app);
        
        // 注册视口变化监听器
        this.editorViewport.addChangeListener((visibleElements) => {
            this.handleViewportChange(visibleElements);
        });
    }
    
    /**
     * 处理视口变化事件
     */
    private handleViewportChange(visibleElements: ViewportElement[]): void {
        // 记录性能指标
        this.metrics.lastBatchSize = visibleElements.length;
        this.metrics.totalProcessed += visibleElements.length;
        
        // 仅处理可见元素，大幅减少DOM操作
        for (const element of visibleElements) {
            this.processElement(element);
        }
    }
    
    /**
     * 设置定期清理机制
     */
    private setupPeriodicCleanup(): void {
        this.cleanupTimer = setInterval(() => {
            this.performCleanup();
        }, this.CLEANUP_INTERVAL);
    }
    
    /**
     * 执行清理操作
     */
    private performCleanup(): void {
        try {
            // 获取当前活跃文件
            const activeFile = this.app.workspace.getActiveFile();
            const recentFiles = new Set(this.app.workspace.getLastOpenFiles());
            
            // 清理不在活跃列表中的缓存
            const stats = this.nameCache.getStats();
            console.debug('缓存统计:', stats);
            
            // 记录性能指标
            this.logMetrics();
        } catch (error) {
            console.error('执行清理操作失败:', error);
        }
    }
    
    /**
     * 记录性能指标
     */
    private logMetrics(): void {
        console.debug('性能指标:', {
            ...this.metrics,
            cacheStats: this.nameCache.getStats()
        });
    }
    
    /**
     * 创建基础样式元素，用于全局CSS样式
     */
    private createStyleElement(): void {
        if (!this.styleEl) {
            this.styleEl = createGlobalStyles();
            document.head.appendChild(this.styleEl);
        }
    }
    
    /**
     * 更新配置
     */
    public updateConfig(config: Partial<DecorationManagerConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 根据配置的规则转换文件名
     */
    public getUpdatedFileName(originalName: string): string | null {
        try {
            // 移除文件扩展名
            const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
            
            // 获取正则表达式缓存实例
            const regexCache = RegexCache.getInstance();
            
            // 验证正则表达式模式是否有效
            if (!regexCache.isValidRegex(this.config.fileNamePattern)) {
                console.error(`无效的正则表达式模式: ${this.config.fileNamePattern}`);
                return this.getFallbackName(nameWithoutExt);
            }
            
            // 使用配置的正则表达式进行匹配
            const regex = regexCache.get(this.config.fileNamePattern);
            const match = nameWithoutExt.match(regex);
            
            // 验证捕获组索引是否有效
            if (match && this.config.captureGroup >= 0 && this.config.captureGroup < match.length) {
                const result = match[this.config.captureGroup];
                // 确保结果不为空
                return result?.trim() || this.getFallbackName(nameWithoutExt);
            }
            
            // 如果匹配失败或捕获组无效，使用回退名称
            return this.getFallbackName(nameWithoutExt);
        } catch (error) {
            console.error(`处理文件名时出错: ${originalName}`, error);
            return originalName; // 发生错误时返回原始文件名
        }
    }
    
    /**
     * 获取回退的显示名称
     */
    private getFallbackName(originalName: string): string {
        // 如果原始名称过长，截取合适长度
        const MAX_LENGTH = 30;
        if (originalName.length > MAX_LENGTH) {
            return originalName.substring(0, MAX_LENGTH - 3) + '...';
        }
        return originalName;
    }
    
    /**
     * 设置文件浏览器观察器
     * 这将处理文件浏览器中的文件显示
     */
    private setupFileExplorerObserver(): void {
        try {
            // 尝试获取文件浏览器元素
            const fileExplorer = document.querySelector('.nav-files-container');
            if (!fileExplorer) {
                // 如果找不到，设置更长的延迟重试
                setTimeout(() => this.setupFileExplorerObserver(), 2000);
                return;
            }
            
            // 创建防抖处理函数
            const debouncedProcessFiles = debounceFn(() => {
                this.processFilesPanel();
            }, 150);

            // 创建观察器监听文件浏览器的变化
            const observer = new MutationObserver(() => {
                debouncedProcessFiles();
            });
            
            // 开始观察，监听更多的变化类型
            observer.observe(fileExplorer, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true // 监听文本变化
            });
            
            // 初始处理所有现有文件
            this.processFilesPanel();
            
            // 添加多个延迟处理，应对不同加载情况
            setTimeout(() => this.processFilesPanel(), 500);
            setTimeout(() => this.processFilesPanel(), 1000);
            setTimeout(() => this.processFilesPanel(), 3000);
            
            // 另外观察整个文档的变化，捕获可能的视图变化
            const docObserver = new MutationObserver((mutations) => {
                // 查找潜在的文件标题相关变化
                for (const mutation of mutations) {
                    if (mutation.target instanceof HTMLElement) {
                        const targetEl = mutation.target;
                        if (targetEl.classList.contains('nav-file-title') || 
                            targetEl.closest('.nav-file-title') || 
                            targetEl.querySelector('.nav-file-title')) {
                            debouncedProcessFiles();
                            break;
                        }
                    }
                }
            });
            
            // 针对整个应用容器应用观察
            const appContainer = document.querySelector('.app-container');
            if (appContainer) {
                docObserver.observe(appContainer, { 
                    childList: true, 
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class', 'data-path']
                });
            }
        } catch (error) {
            console.error('设置文件浏览器观察器失败:', error);
        }
    }
    
    /**
     * 应用文件元素装饰
     * 使用分批处理机制来优化大量文件的处理
     */
    public applyFileDecorations(files: TFile[]): void {
        const BATCH_SIZE = 100; // 每批处理100个文件
        let processedCount = 0;
        
        const processBatch = () => {
            try {
                const startIndex = processedCount;
                const endIndex = Math.min(startIndex + BATCH_SIZE, files.length);
                const batch = files.slice(startIndex, endIndex);
                
                // 处理当前批次的文件
                for (const file of batch) {
                    try {
                        const originalName = file.basename;
                        const newName = this.getUpdatedFileName(originalName);
                        
                        if (newName && newName !== originalName) {
                            // 更新名称映射
                            this.updateNameMapping(originalName, newName);
                            
                            // 找到并更新DOM元素
                            this.updateFileElements(file.path, newName);
                        }
                    } catch (error) {
                        console.error(`处理文件失败: ${file.path}`, error);
                    }
                }
                
                processedCount = endIndex;
                
                // 如果还有未处理的文件，继续下一批
                if (processedCount < files.length) {
                    requestIdleCallback(processBatch);
                } else {
                    // 所有文件处理完成后，处理文件面板
                    this.processFilesPanel();
                }
            } catch (error) {
                console.error('批量处理文件装饰失败:', error);
            }
        };
        
        // 开始第一批处理
        requestIdleCallback(processBatch);
    }
    
    /**
     * 获取当前视口中的可见文件
     * 如果文件数量少于阈值，则返回所有文件
     */
    private getVisibleFiles(files: TFile[]): TFile[] {
        // 如果文件不多，直接处理所有文件，解决Files panel中未点击文件不显示修改后名称的问题
        const THRESHOLD = 500; // 提高阈值以处理更多文件
        if (files.length <= THRESHOLD) {
            return files;
        }
        
        // 获取当前可见的视图中的文件路径
        const visiblePaths = new Set<string>();
        
        // 从EditorViewport获取可见元素关联的文件路径
        if (this.editorViewport) {
            const visibleElements = this.editorViewport.getVisibleElements();
            visibleElements.forEach(el => {
                if (el.path) {
                    visiblePaths.add(el.path);
                }
            });
        }
        
        // 如果没有可见路径，处理最近活动的文件
        if (visiblePaths.size === 0) {
            // 获取当前活动文件
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                visiblePaths.add(activeFile.path);
            }
            
            // 获取最近打开的文件
            const recentFiles = this.app.workspace.getLastOpenFiles();
            for (const path of recentFiles.slice(0, 20)) { // 增加处理更多最近文件
                visiblePaths.add(path);
            }
        }
        
        // 筛选出可见文件
        const visibleFiles = files.filter(file => visiblePaths.has(file.path));
        
        // 如果可见文件不多，则返回更多文件以确保文件面板显示正确
        return visibleFiles.length > 0 ? [...visibleFiles, ...files.slice(0, 100)] : files.slice(0, THRESHOLD);
    }
    
    /**
     * 更新文件相关DOM元素的显示
     */
    private updateFileElements(filePath: string, displayName: string): void {
        try {
            // 提取文件名（不含扩展名）和文件路径信息
            const filePathWithoutExt = filePath.replace(/\.[^/.]+$/, "");
            const fileName = filePathWithoutExt.split('/').pop() || '';
            const fullFileName = filePath.split('/').pop() || '';
            
            // 1. 查找所有通过data-path属性关联的元素
            const pathElements = document.querySelectorAll(`[data-path="${CSS.escape(filePath)}"]`);
            pathElements.forEach(el => {
                // 对于文件标题元素的处理
                const titleContent = el.querySelector('.nav-file-title-content');
                if (titleContent) {
                    DOMUtils.setAttributes(titleContent as HTMLElement, {
                        'data-displayed-filename': displayName
                    });
                }
                
                // 对于其他元素的处理
                const headerTitle = el.querySelector('.workspace-tab-header-inner-title, .view-header-title');
                if (headerTitle) {
                    DOMUtils.setAttributes(headerTitle as HTMLElement, {
                        'data-displayed-filename': displayName
                    });
                }
            });
            
            // 2. 针对Files panel特殊处理
            const fileExplorer = document.querySelector('.nav-files-container');
            if (fileExplorer) {
                // 查找所有文件标题内容元素
                const fileTitleContents = fileExplorer.querySelectorAll('.nav-file-title-content');
                
                for (const titleEl of Array.from(fileTitleContents)) {
                    const currentText = titleEl.textContent;
                    if (!currentText) continue;
                    
                    // 精确匹配文件名
                    if (currentText === fileName || currentText === fullFileName) {
                        DOMUtils.setAttributes(titleEl as HTMLElement, {
                            'data-displayed-filename': displayName
                        });
                        
                        // 保存原始路径信息到父元素
                        const fileTitle = titleEl.closest('.nav-file-title');
                        if (fileTitle && !fileTitle.hasAttribute('data-path')) {
                            DOMUtils.setAttributes(fileTitle as HTMLElement, {
                                'data-path': filePath
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`更新文件元素失败: ${filePath}`, error);
        }
    }
    
    /**
     * 清除文件装饰
     */
    public clearFileDecorations(): void {
        // 移除所有数据属性
        document.querySelectorAll('[data-displayed-filename]').forEach(el => {
            DOMUtils.setAttributes(el as HTMLElement, {
                'data-displayed-filename': ''
            });
            el.removeAttribute('data-displayed-filename');
        });
    }
    
    /**
     * 更新名称映射关系
     */
    public updateNameMapping(originalName: string, displayName: string): void {
        this.nameCache.set(originalName, displayName);
    }
    
    /**
     * 查找原始文件名
     */
    public findOriginalFileName(displayName: string): string | null {
        return this.nameCache.get(displayName);
    }
    
    /**
     * 清理名称映射
     */
    public clearNameMapping(): void {
        this.nameCache.clear();
    }
    
    /**
     * 处理单个元素的装饰
     */
    private processElement(element: ViewportElement): void {
        const startTime = performance.now();
        
        try {
            // 获取元素内容
            const content = element.element.textContent;
            if (!content) return;
            
            // 检查缓存
            let newName = this.nameCache.get(content);
            if (!newName) {
                newName = this.getUpdatedFileName(content);
                if (newName && newName !== content) {
                    this.nameCache.set(content, newName);
                }
            }
            
            if (!newName || newName === content) return;
            
            // 使用 requestAnimationFrame 优化DOM更新
            requestAnimationFrame(() => {
                this.updateElementDisplay(element.element, content, newName!);
            });
        } finally {
            // 更新性能指标
            const processTime = performance.now() - startTime;
            this.updateMetrics(processTime);
        }
    }
    
    /**
     * 更新元素显示
     */
    private updateElementDisplay(element: HTMLElement, originalText: string, newName: string): void {
        if (element.dataset.originalText === originalText) return;
        
        // 保存原始文本
        DOMUtils.setDataset(element, {
            originalText
        });
        
        // 创建装饰部件
        const widget = new FilenameDecorationWidget(
            newName,
            originalText,
            this.config.showOriginalNameOnHover
        );
        
        // 使用 DocumentFragment 优化DOM操作
        const fragment = document.createDocumentFragment();
        fragment.appendChild(widget.toDOM());
        
        // 清空并更新元素内容
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
        element.appendChild(fragment);
    }
    
    /**
     * 更新性能指标
     */
    private updateMetrics(processTime: number): void {
        this.metrics.totalProcessed++;
        this.metrics.lastProcessTime = processTime;
        this.metrics.avgProcessTime = (this.metrics.avgProcessTime * (this.metrics.totalProcessed - 1) + processTime) / this.metrics.totalProcessed;
    }
    
    /**
     * 销毁并清理资源
     */
    public destroy(): void {
        this.clearFileDecorations();
        this.clearNameMapping();
        
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        if (this.editorViewport) {
            this.editorViewport.destroy();
            this.editorViewport = null;
        }
        
        if (this.styleEl) {
            this.styleEl.remove();
            this.styleEl = null;
        }
        
        // 记录最终性能指标
        this.logMetrics();
    }
    
    /**
     * 创建编辑器视图插件
     * 为编辑器中的内部链接应用装饰
     */
    public createEditorViewPlugin() {
        const manager = this;
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
                    const visibleRanges = view.visibleRanges;
                    
                    // 仅处理可见区域的内容
                    for (const {from, to} of visibleRanges) {
                        const text = view.state.doc.sliceString(from, to);
                        const lines = text.split('\n');
                        let offset = from;
                        
                        // 遍历每一行
                        for (const line of lines) {
                            // 使用正则匹配内部链接
                            const linkRegex = RegexCache.getInstance().get('\\[\\[([^\\]]+)\\]\\]', 'g');
                            let match;
                            
                            while ((match = linkRegex.exec(line)) !== null) {
                                const originalText = match[1];
                                const linkStart = offset + match.index + 2; // 跳过 [[ 
                                const linkEnd = linkStart + originalText.length;
                                
                                // 获取更新后的文件名
                                const newName = manager.getUpdatedFileName(originalText);
                                
                                if (newName && newName !== originalText) {
                                    // 创建替换装饰
                                    builder.add(
                                        linkStart, 
                                        linkEnd, 
                                        Decoration.replace({
                                            widget: new FilenameDecorationWidget(
                                                newName, 
                                                originalText, 
                                                manager.config.showOriginalNameOnHover
                                            )
                                        })
                                    );
                                }
                            }
                            
                            // 更新偏移量
                            offset += line.length + 1; // +1 为换行符
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
     * 处理文件面板中的所有文件
     */
    private processFilesPanel(): void {
        try {
            // 获取所有文件标题内容元素
            const fileTitleContents = document.querySelectorAll('.nav-file-title-content');
            
            for (const titleEl of Array.from(fileTitleContents)) {
                if (!titleEl.textContent) continue;
                
                // 获取原始文件名
                const fileName = titleEl.textContent;
                
                // 获取更新后的文件名
                const newName = this.getUpdatedFileName(fileName);
                if (!newName || newName === fileName) continue;
                
                // 直接在内容元素上设置属性
                DOMUtils.setAttributes(titleEl as HTMLElement, {
                    'data-displayed-filename': newName
                });
                
                // 更新映射
                this.updateNameMapping(fileName, newName);
                
                // 同时更新父元素（为了兼容性）
                const navFileTitle = titleEl.closest('.nav-file-title');
                if (navFileTitle) {
                    // 尝试找到文件路径
                    const filePath = navFileTitle.getAttribute('data-path');
                    if (!filePath) {
                        const parent = navFileTitle.closest('.nav-file');
                        if (parent) {
                            const possiblePath = parent.getAttribute('data-path');
                            if (possiblePath) {
                                DOMUtils.setAttributes(navFileTitle as HTMLElement, {
                                    'data-path': possiblePath
                                });
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('处理文件面板失败:', error);
        }
    }
} 