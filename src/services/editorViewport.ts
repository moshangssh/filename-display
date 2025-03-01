import { App, MarkdownView, WorkspaceLeaf, Editor } from 'obsidian';
import { debounce } from '../utils/debounce';

/**
 * 视口元素接口
 */
export interface ViewportElement {
    id: string;           // 元素唯一标识
    element: HTMLElement; // DOM元素
    path: string;         // 关联文件路径
    visible: boolean;     // 是否在视口中可见
}

/**
 * 视口变更监听器
 */
export type ViewportChangeListener = (visibleElements: ViewportElement[]) => void;

/**
 * 编辑器视口管理器
 * 负责监听视口变化和优化DOM操作
 */
export class EditorViewport {
    private app: App;
    private elements: Map<string, ViewportElement> = new Map();
    private observer: IntersectionObserver | null = null;
    private changeListeners: Set<ViewportChangeListener> = new Set();
    private visibleElements: ViewportElement[] = [];
    private activeLeaf: WorkspaceLeaf | null = null;
    
    // 性能监控
    private updateCount: number = 0;
    private totalDomOps: number = 0;
    
    constructor(app: App) {
        this.app = app;
        this.setupIntersectionObserver();
        this.registerEvents();
    }
    
    /**
     * 设置交叉观察器
     */
    private setupIntersectionObserver(): void {
        // 配置观察器选项 - 使用更适合文档的阈值
        const options = {
            root: null, // 相对于视口
            rootMargin: '100px', // 扩大观察区域以提前加载
            threshold: [0, 0.1, 0.5, 1.0] // 多个阈值以获得更精确的可见性变化
        };
        
        // 创建观察器实例
        this.observer = new IntersectionObserver((entries) => {
            let changed = false;
            
            for (const entry of entries) {
                const id = entry.target.getAttribute('data-viewport-id');
                if (!id) continue;
                
                const element = this.elements.get(id);
                if (!element) continue;
                
                // 更新可见性状态
                const wasVisible = element.visible;
                element.visible = entry.isIntersecting;
                
                // 如果可见性发生变化
                if (wasVisible !== element.visible) {
                    changed = true;
                }
            }
            
            // 如果有元素的可见性发生了变化，通知监听器
            if (changed) {
                this.updateVisibleElements();
            }
        }, options);
    }
    
    /**
     * 更新可见元素列表并通知监听器
     */
    private updateVisibleElements(): void {
        // 过滤出可见元素
        this.visibleElements = Array.from(this.elements.values())
            .filter(element => element.visible);
        
        // 通知所有监听器
        for (const listener of this.changeListeners) {
            listener(this.visibleElements);
        }
        
        // 记录性能指标
        this.updateCount++;
        this.totalDomOps += this.visibleElements.length;
        
        // 每10次更新记录一次性能数据
        if (this.updateCount % 10 === 0) {
            console.log(`视口更新: 第 ${this.updateCount} 次更新，处理了 ${this.visibleElements.length} 个可见元素，累计DOM操作: ${this.totalDomOps} 次`);
        }
    }
    
    /**
     * 注册工作区事件
     */
    private registerEvents(): void {
        // 监听活动叶子更改
        this.app.workspace.onLayoutReady(() => {
            // 初始化处理当前活动叶子
            this.handleActiveLeafChange();
            
            // 注册视图更改事件
            this.app.workspace.on('active-leaf-change', () => {
                this.handleActiveLeafChange();
            });
            
            // 监听文件打开事件
            this.app.workspace.on('file-open', () => {
                // 延迟处理以确保DOM已更新
                setTimeout(() => this.scanCurrentView(), 50);
            });
            
            // 编辑器内容变化时重新扫描
            this.app.workspace.on('editor-change', debounce(() => {
                this.scanCurrentView();
            }, 200));
            
            // 窗口大小改变时重新计算视口
            window.addEventListener('resize', debounce(() => {
                this.recalculateViewport();
            }, 200));
        });
    }
    
    /**
     * 处理活动叶子变化
     */
    private handleActiveLeafChange(): void {
        // 获取当前活动叶子
        const activeLeaf = this.app.workspace.activeLeaf;
        
        // 如果活动叶子没有变化，不做处理
        if (activeLeaf === this.activeLeaf) return;
        
        // 更新活动叶子引用
        this.activeLeaf = activeLeaf;
        
        // 清空当前元素集合
        this.clearElements();
        
        // 扫描当前视图中的元素
        this.scanCurrentView();
    }
    
    /**
     * 扫描当前视图中的元素
     */
    private scanCurrentView(): void {
        // 获取当前活动的Markdown视图
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        
        // 获取编辑器DOM
        const editorEl = (view.editor as any).cm.dom;
        if (!editorEl) return;
        
        // 获取当前文件路径
        const filePath = view.file?.path || '';
        
        // 查找所有内部链接元素
        const linkElements = editorEl.querySelectorAll('.cm-hmd-internal-link');
        
        // 为每个链接元素注册到视口监听
        linkElements.forEach((linkEl: HTMLElement, index: number) => {
            this.registerElement({
                id: `link-${filePath}-${index}`,
                element: linkEl,
                path: filePath,
                visible: false
            });
        });
        
        // 强制重新计算视口
        this.recalculateViewport();
    }
    
    /**
     * 注册元素到视口监听
     */
    public registerElement(element: ViewportElement): void {
        // 如果元素已存在，先清除
        if (this.elements.has(element.id)) {
            this.unregisterElement(element.id);
        }
        
        // 设置元素ID属性以便在观察器回调中识别
        element.element.setAttribute('data-viewport-id', element.id);
        
        // 添加到元素映射中
        this.elements.set(element.id, element);
        
        // 将元素添加到观察器
        if (this.observer) {
            this.observer.observe(element.element);
        }
    }
    
    /**
     * 注销元素的视口监听
     */
    public unregisterElement(id: string): void {
        const element = this.elements.get(id);
        if (!element) return;
        
        // 从观察器移除
        if (this.observer) {
            this.observer.unobserve(element.element);
        }
        
        // 从映射中删除
        this.elements.delete(id);
    }
    
    /**
     * 清除所有元素
     */
    public clearElements(): void {
        // 从观察器中移除所有元素
        if (this.observer) {
            for (const element of this.elements.values()) {
                this.observer.unobserve(element.element);
            }
        }
        
        // 清空元素映射
        this.elements.clear();
        
        // 清空可见元素列表
        this.visibleElements = [];
    }
    
    /**
     * 添加视口变化监听器
     */
    public addChangeListener(listener: ViewportChangeListener): void {
        this.changeListeners.add(listener);
    }
    
    /**
     * 移除视口变化监听器
     */
    public removeChangeListener(listener: ViewportChangeListener): void {
        this.changeListeners.delete(listener);
    }
    
    /**
     * 强制重新计算视口
     */
    public recalculateViewport(): void {
        // 如果没有元素，不需要计算
        if (this.elements.size === 0) return;
        
        // 强制更新所有元素的交叉状态
        if (this.observer) {
            const currentElements = Array.from(this.elements.values());
            
            // 先从观察器中移除所有元素
            for (const element of currentElements) {
                this.observer.unobserve(element.element);
            }
            
            // 重新添加到观察器
            for (const element of currentElements) {
                this.observer.observe(element.element);
            }
        }
    }
    
    /**
     * 获取当前可见元素
     */
    public getVisibleElements(): ViewportElement[] {
        return [...this.visibleElements];
    }
    
    /**
     * 销毁视口管理器
     */
    public destroy(): void {
        // 清除所有元素
        this.clearElements();
        
        // 清除观察器
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        // 清除所有监听器
        this.changeListeners.clear();
    }
} 