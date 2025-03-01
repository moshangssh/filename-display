import { ViewPlugin, DecorationSet, Decoration, EditorView, ViewUpdate, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { TFile, App } from 'obsidian';
import { RegexCache } from '../utils/regexCache';
import { EditorViewport, ViewportElement } from './editorViewport';

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
export class FilenameDecorationWidget extends WidgetType {
    constructor(
        readonly displayText: string, 
        readonly originalText: string, 
        readonly showTooltip: boolean
    ) {
        super();
    }

    toDOM() {
        const container = document.createElement('span');
        container.className = 'filename-decoration-widget';
        
        // 显示新名称
        const display = document.createElement('span');
        display.textContent = this.displayText;
        display.className = 'filename-display cm-hmd-internal-link';
        container.appendChild(display);

        // 根据设置决定是否添加提示
        if (this.showTooltip) {
            const tooltip = document.createElement('span');
            tooltip.textContent = this.originalText;
            tooltip.className = 'filename-tooltip';
            container.appendChild(tooltip);
        }

        // 保存原始文本用于复制等操作
        container.dataset.originalText = this.originalText;

        return container;
    }

    eq(other: FilenameDecorationWidget): boolean {
        return other.displayText === this.displayText && 
               other.originalText === this.originalText &&
               other.showTooltip === this.showTooltip;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

/**
 * 文件名装饰管理器
 * 使用CodeMirror 6 Decoration系统来管理文件名显示
 */
export class DecorationManager {
    private config: DecorationManagerConfig;
    private nameMapping: Map<string, string> = new Map();
    private styleEl: HTMLStyleElement | null = null;
    private editorViewport: EditorViewport | null = null;
    private app: App;
    
    // 性能指标
    private totalElementsProcessed: number = 0;
    private lastProcessedCount: number = 0;
    
    constructor(app: App, config: DecorationManagerConfig) {
        this.app = app;
        this.config = { ...config };
        this.createStyleElement();
        // 初始化EditorViewport
        this.setupEditorViewport();
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
        this.lastProcessedCount = visibleElements.length;
        this.totalElementsProcessed += visibleElements.length;
        
        // 仅处理可见元素，大幅减少DOM操作
        for (const element of visibleElements) {
            this.processElement(element);
        }
    }
    
    /**
     * 处理单个元素的装饰
     */
    private processElement(element: ViewportElement): void {
        // 获取元素内容
        const content = element.element.textContent;
        if (!content) return;
        
        // 获取更新后的文件名
        const newName = this.getUpdatedFileName(content);
        if (!newName || newName === content) return;
        
        // 更新元素显示
        if (element.element.dataset.originalText !== content) {
            // 保存原始文本
            element.element.dataset.originalText = content;
            
            // 创建装饰容器
            const container = document.createElement('span');
            container.className = 'filename-decoration-widget';
            
            // 显示新名称
            const display = document.createElement('span');
            display.textContent = newName;
            display.className = 'filename-display';
            container.appendChild(display);
            
            // 根据设置决定是否添加提示
            if (this.config.showOriginalNameOnHover) {
                const tooltip = document.createElement('span');
                tooltip.textContent = content;
                tooltip.className = 'filename-tooltip';
                container.appendChild(tooltip);
            }
            
            // 清空原始元素内容
            while (element.element.firstChild) {
                element.element.removeChild(element.element.firstChild);
            }
            
            // 添加装饰容器
            element.element.appendChild(container);
            
            // 更新映射关系
            this.updateNameMapping(content, newName);
        }
    }
    
    /**
     * 创建基础样式元素，用于全局CSS样式
     */
    private createStyleElement(): void {
        if (!this.styleEl) {
            this.styleEl = document.createElement('style');
            this.styleEl.id = 'filename-display-global-styles';
            document.head.appendChild(this.styleEl);
            
            // 添加全局基础样式
            this.styleEl.textContent = `
                .filename-decoration-widget {
                    position: relative;
                    display: inline-block;
                }
                .filename-display {
                    color: var(--text-accent);
                    text-decoration: none;
                    cursor: pointer;
                }
                .filename-tooltip {
                    display: none;
                    position: absolute;
                    bottom: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: 4px 8px;
                    background-color: var(--background-modifier-hover);
                    border-radius: 4px;
                    font-size: 12px;
                    z-index: 100;
                }
                .filename-decoration-widget:hover .filename-tooltip {
                    display: block;
                }
                
                /* 文件树和标签页样式 */
                [data-displayed-filename] .nav-file-title-content,
                [data-displayed-filename] .workspace-tab-header-inner-title,
                [data-displayed-filename] .view-header-title,
                [data-displayed-filename] .tree-item-inner {
                    color: transparent;
                    position: relative;
                }
                
                [data-displayed-filename] .nav-file-title-content::before,
                [data-displayed-filename] .workspace-tab-header-inner-title::before,
                [data-displayed-filename] .view-header-title::before,
                [data-displayed-filename] .tree-item-inner::before {
                    content: attr(data-displayed-filename);
                    position: absolute;
                    left: 0;
                    color: var(--text-normal);
                    /* 添加GPU加速 */
                    transform: translateZ(0);
                    will-change: transform;
                }
            `;
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
            
            // 使用配置的正则表达式进行匹配
            const regex = RegexCache.getInstance().get(this.config.fileNamePattern);
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
            // 记录错误并使用回退名称
            console.error('文件名处理错误:', error);
            return this.getFallbackName(originalName);
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
     * 应用文件元素装饰
     * 为DOM元素添加data-displayed-filename属性来修改显示
     * 不再使用CSS规则覆盖，而是使用数据属性和单一全局样式
     */
    public applyFileDecorations(files: TFile[]): void {
        try {
            // 清除旧的名称映射
            this.clearNameMapping();
            
            // 计算需要处理的文件
            const filesToProcess = this.getVisibleFiles(files);
            
            // 批量处理文件
            for (const file of filesToProcess) {
                try {
                    const originalName = file.basename;
                    const newName = this.getUpdatedFileName(originalName);
                    
                    if (newName) {
                        // 更新名称映射
                        this.updateNameMapping(originalName, newName);
                        
                        // 找到并更新DOM元素
                        this.updateFileElements(file.path, newName);
                    }
                } catch (error) {
                    console.error(`处理文件失败: ${file.path}`, error);
                }
            }
        } catch (error) {
            console.error('应用文件装饰失败:', error);
        }
    }
    
    /**
     * 获取当前视口中的可见文件
     * 如果文件数量少于阈值，则返回所有文件
     */
    private getVisibleFiles(files: TFile[]): TFile[] {
        // 如果文件数量很少，直接返回所有文件
        const THRESHOLD = 50;
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
            for (const path of recentFiles.slice(0, 5)) { // 最多处理5个最近文件
                visiblePaths.add(path);
            }
        }
        
        // 筛选出可见文件
        const visibleFiles = files.filter(file => visiblePaths.has(file.path));
        
        // 如果没有可见文件，则返回部分文件作为备选
        return visibleFiles.length > 0 ? visibleFiles : files.slice(0, THRESHOLD);
    }
    
    /**
     * 更新文件相关DOM元素的显示
     */
    private updateFileElements(filePath: string, displayName: string): void {
        // 查找所有相关元素并更新数据属性
        const elements = document.querySelectorAll(`[data-path="${CSS.escape(filePath)}"]`);
        elements.forEach(el => {
            el.setAttribute('data-displayed-filename', displayName);
        });
    }
    
    /**
     * 清除文件装饰
     */
    public clearFileDecorations(): void {
        // 移除所有数据属性
        document.querySelectorAll('[data-displayed-filename]').forEach(el => {
            el.removeAttribute('data-displayed-filename');
        });
    }
    
    /**
     * 更新名称映射
     */
    public updateNameMapping(originalName: string, displayName: string): void {
        this.nameMapping.set(displayName, originalName);
        this.nameMapping.set(originalName, originalName); // 自身映射，保证查找时能找到
    }
    
    /**
     * 查找原始文件名
     */
    public findOriginalFileName(displayName: string): string | null {
        return this.nameMapping.get(displayName) || null;
    }
    
    /**
     * 清空名称映射
     */
    public clearNameMapping(): void {
        this.nameMapping.clear();
    }
    
    /**
     * 销毁并清理资源
     */
    public destroy(): void {
        this.clearFileDecorations();
        this.clearNameMapping();
        
        // 销毁EditorViewport
        if (this.editorViewport) {
            this.editorViewport.destroy();
            this.editorViewport = null;
        }
        
        if (this.styleEl) {
            this.styleEl.remove();
            this.styleEl = null;
        }
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
} 