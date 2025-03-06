import { ViewPlugin, DecorationSet, Decoration, EditorView, ViewUpdate, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { TFile, App } from 'obsidian';
import { RegexCache } from '../utils/regexCache';
import { EditorViewport, ViewportElement } from './legacyAdapters';
import { BaseWidget } from '../ui/linkWidget';
import { DOMUtils } from '../utils/domUtils';
import { createGlobalStyles } from '../styles/widgetStyles';
import { debounceFn } from '../utils/debounceIntegration';
import { CacheService } from './cacheService';
import { NameTransformer } from './nameTransformer';

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
 * 文件名装饰管理器
 * 使用CodeMirror 6 Decoration系统来管理文件名显示
 */
export class DecorationManager {
    private config: DecorationManagerConfig;
    private readonly nameCache: CacheService<string, string>;
    private styleEl: HTMLStyleElement | null = null;
    private editorViewport: EditorViewport | null = null;
    private app: App;
    private readonly CLEANUP_INTERVAL = 1000 * 60 * 5; // 5分钟清理一次
    private cleanupTimer: NodeJS.Timeout | null = null;
    private nameTransformer: NameTransformer;
    
    // 性能监控
    private metrics = {
        totalProcessed: 0,
        lastBatchSize: 0,
        lastProcessTime: 0,
        avgProcessTime: 0,
        maxProcessTime: 0
    };
    
    // 用于存储已处理过的元素集合
    private processedElements = new WeakSet<HTMLElement>();
    
    // 用于存储元素的文件路径
    private elementPathCache = new WeakMap<HTMLElement, string>();
    
    // 使用MutationObserver处理DOM变化
    private fileExplorerObserver: MutationObserver | null = null;
    
    // 记录上次处理的时间戳
    private lastProcessTimestamp = 0;
    
    // 处理间隔阈值（单位：毫秒）
    private readonly PROCESS_THROTTLE_INTERVAL = 50;
    
    // 记录是否有待处理的更新
    private hasPendingUpdates = false;
    
    // 请求更新的ID，用于取消已调度但尚未执行的更新
    private requestUpdateId: number | null = null;
    
    constructor(app: App, config: DecorationManagerConfig) {
        this.app = app;
        this.config = { ...config };
        this.nameCache = new CacheService<string, string>(1000);
        this.nameTransformer = new NameTransformer({
            fileNamePattern: this.config.fileNamePattern,
            captureGroup: this.config.captureGroup
        });
        
        this.createStyleElement();
        this.setupEditorViewport();
        this.setupFileExplorerObserver();
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
        this.editorViewport = new EditorViewport(this.app);
        this.editorViewport.addChangeListener((visibleElements: ViewportElement[]) => {
            this.handleViewportChange(visibleElements);
        });
    }
    
    /**
     * 获取编辑器视口实例
     * @returns EditorViewport实例
     */
    public getEditorViewport(): EditorViewport | null {
        return this.editorViewport;
    }
    
    /**
     * 处理视口变化事件
     */
    private handleViewportChange(visibleElements: ViewportElement[]): void {
        for (const element of visibleElements) {
            if (element.visible) {
                this.processElement(element);
            }
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
        
        // 同步更新NameTransformer配置
        this.nameTransformer.updateConfig({
            fileNamePattern: this.config.fileNamePattern,
            captureGroup: this.config.captureGroup
        });
    }
    
    /**
     * 根据配置的规则转换文件名
     */
    public getUpdatedFileName(originalName: string): string | null {
        return this.nameTransformer.transformFileName(originalName);
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
                setTimeout(() => this.setupFileExplorerObserver(), 1000);
                return;
            }
            
            // 如果已经存在observer，先断开连接
            if (this.fileExplorerObserver) {
                this.fileExplorerObserver.disconnect();
            }
            
            // 创建新的MutationObserver
            this.fileExplorerObserver = new MutationObserver(this.handleFileExplorerMutation.bind(this));
            
            // 观察文件浏览器的变化
            this.fileExplorerObserver.observe(fileExplorer, {
                childList: true,
                subtree: true,
                attributes: false,
                characterData: true
            });
            
            // 初始处理所有现有文件
            this.requestProcessFilesPanel();
        } catch (error) {
            console.error('设置文件浏览器观察器失败:', error);
        }
    }
    
    /**
     * 处理文件浏览器DOM变化
     */
    private handleFileExplorerMutation(mutations: MutationRecord[]): void {
        // 如果没有变化，直接返回
        if (mutations.length === 0) return;
        
        // 检查是否有需要处理的变化
        const hasRelevantChange = mutations.some(mutation => {
            // 仅处理添加节点或文本内容变化
            return mutation.type === 'childList' || mutation.type === 'characterData';
        });
        
        if (hasRelevantChange) {
            this.requestProcessFilesPanel();
        }
    }
    
    /**
     * 请求处理文件面板（节流处理）
     */
    private requestProcessFilesPanel(): void {
        // 标记有待处理的更新
        this.hasPendingUpdates = true;
        
        // 如果已经有调度的更新，不再创建新的
        if (this.requestUpdateId !== null) return;
        
        // 检查是否可以立即处理
        const now = Date.now();
        const timeSinceLastProcess = now - this.lastProcessTimestamp;
        
        if (timeSinceLastProcess >= this.PROCESS_THROTTLE_INTERVAL) {
            // 可以立即处理
            this.processFilesPanel();
        } else {
            // 需要延迟处理
            const delay = this.PROCESS_THROTTLE_INTERVAL - timeSinceLastProcess;
            this.requestUpdateId = window.setTimeout(() => {
                this.requestUpdateId = null;
                if (this.hasPendingUpdates) {
                    this.processFilesPanel();
                }
            }, delay) as unknown as number;
        }
    }
    
    /**
     * 处理文件面板
     * 优化后的实现，使用批处理和缓存，避免重复处理
     */
    private processFilesPanel(): void {
        try {
            // 重置标志
            this.hasPendingUpdates = false;
            this.lastProcessTimestamp = Date.now();
            
            // 获取所有文件标题内容元素
            const fileTitleContents = document.querySelectorAll('.nav-file-title-content');
            
            // 1. 收集需要更新的元素及其新文件名
            const pendingUpdates: Array<{
                element: HTMLElement, 
                originalName: string, 
                newName: string
            }> = [];
            
            // 预处理阶段 - 确定哪些元素需要更新
            for (const titleEl of Array.from(fileTitleContents)) {
                // 跳过已处理的元素（除非强制重新处理）
                if (this.processedElements.has(titleEl as HTMLElement)) continue;
                
                if (!titleEl.textContent) continue;
                
                // 获取原始文件名
                const fileName = titleEl.textContent;
                
                // 获取更新后的文件名
                const newName = this.getUpdatedFileName(fileName);
                if (!newName || newName === fileName) {
                    // 标记为已处理
                    this.processedElements.add(titleEl as HTMLElement);
                    continue;
                }
                
                // 添加到待更新队列
                pendingUpdates.push({
                    element: titleEl as HTMLElement,
                    originalName: fileName,
                    newName: newName
                });
            }
            
            // 如果没有需要更新的元素，直接返回
            if (pendingUpdates.length === 0) return;
            
            // 2. 使用requestAnimationFrame批量应用DOM更新
            window.requestAnimationFrame(() => {
                // 收集文件路径更新
                const pathUpdates: Array<{
                    element: HTMLElement,
                    path: string
                }> = [];
                
                // 使用DocumentFragment存储临时操作结果
                const fragment = document.createDocumentFragment();
                const tempElements = new Map<HTMLElement, HTMLElement>();
                
                // 处理每个待更新项
                for (const update of pendingUpdates) {
                    const { element, originalName, newName } = update;
                    
                    // 创建临时克隆进行处理，避免频繁触发DOM重排
                    const tempElement = element.cloneNode(true) as HTMLElement;
                    tempElements.set(element, tempElement);
                    
                    // 在临时元素上设置数据属性
                    DOMUtils.setAttributes(tempElement, {
                        'data-displayed-filename': newName
                    });
                    
                    // 更新映射
                    this.updateNameMapping(originalName, newName);
                    
                    // 处理navFileTitle相关路径设置
                    const navFileTitle = element.closest('.nav-file-title');
                    if (navFileTitle) {
                        // 检查缓存中是否已有路径信息
                        let filePath = this.elementPathCache.get(navFileTitle as HTMLElement);
                        
                        if (!filePath) {
                            // 尝试从元素获取路径
                            filePath = navFileTitle.getAttribute('data-path') || undefined;
                            
                            if (!filePath) {
                                const parent = navFileTitle.closest('.nav-file');
                                if (parent) {
                                    const possiblePath = parent.getAttribute('data-path') || undefined;
                                    if (possiblePath) {
                                        filePath = possiblePath;
                                        
                                        // 将路径更新收集起来，一起批量处理
                                        pathUpdates.push({
                                            element: navFileTitle as HTMLElement,
                                            path: possiblePath
                                        });
                                        
                                        // 缓存路径以避免重复查询
                                        this.elementPathCache.set(navFileTitle as HTMLElement, possiblePath);
                                    }
                                }
                            } else {
                                // 缓存已有的路径
                                this.elementPathCache.set(navFileTitle as HTMLElement, filePath);
                            }
                        }
                    }
                    
                    // 标记为已处理
                    this.processedElements.add(element);
                }
                
                // 执行批量DOM更新
                const performBatchUpdate = () => {
                    // 1. 应用文件名显示更新
                    tempElements.forEach((tempElement, originalElement) => {
                        // 将tempElement的数据属性同步到原始元素
                        DOMUtils.setAttributes(originalElement, {
                            'data-displayed-filename': tempElement.getAttribute('data-displayed-filename') || ''
                        });
                    });
                    
                    // 2. 应用路径更新
                    pathUpdates.forEach(update => {
                        DOMUtils.setAttributes(update.element, {
                            'data-path': update.path
                        });
                    });
                };
                
                // 执行批量更新
                performBatchUpdate();
                
                // 将已处理元素数量记录到性能指标
                this.metrics.lastBatchSize = pendingUpdates.length;
                this.metrics.totalProcessed += pendingUpdates.length;
            });
        } catch (error) {
            console.error('处理文件面板失败:', error);
        }
    }
    
    /**
     * 清理缓存和标记，强制重新处理所有元素
     */
    public forceRefreshFilePanel(): void {
        // 清除已处理元素的缓存
        this.processedElements = new WeakSet<HTMLElement>();
        
        // 清除路径缓存
        this.elementPathCache = new WeakMap<HTMLElement, string>();
        
        // 请求处理
        this.requestProcessFilesPanel();
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
        this.nameCache.set(displayName, originalName);
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
        if (processTime > this.metrics.maxProcessTime) {
            this.metrics.maxProcessTime = processTime;
        }
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
     * 查找与显示名称对应的原始文件名
     */
    public findOriginalFileName(displayName: string): string | null {
        // 从缓存中查找
        return this.nameCache.get(displayName);
    }
    
    /**
     * 清理名称映射
     */
    public clearNameMapping(): void {
        this.nameCache.clear();
    }
} 