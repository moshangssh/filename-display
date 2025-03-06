import { App, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { debounceFn } from '../utils/debounceIntegration';

/**
 * 观察元素接口
 */
export interface ObservedElement {
    id: string;           // 元素唯一标识
    element: HTMLElement; // DOM元素
    path: string;         // 关联文件路径
    visible: boolean;     // 是否在视口中可见
    type: string;         // 元素类型
}

/**
 * 可见性变更监听器
 */
export type VisibilityChangeListener = (visibleElements: ObservedElement[]) => void;

/**
 * DOM结构变更监听器
 */
export type DOMChangeListener = () => void;

/**
 * 统一DOM观察系统
 * 整合DOMObserverService、VisibilityTracker和EditorViewport的功能
 */
export class UnifiedDOMObserver {
    private app: App;
    
    // 元素追踪相关
    private elements: Map<string, ObservedElement> = new Map();
    private visibleElements: ObservedElement[] = [];
    private activeLeaf: WorkspaceLeaf | null = null;
    
    // 观察器
    private intersectionObserver: IntersectionObserver | null = null;
    private mutationObserver: MutationObserver | null = null;
    
    // 监听器
    private visibilityChangeListeners: Set<VisibilityChangeListener> = new Set();
    private domChangeListeners: Set<DOMChangeListener> = new Set();
    
    // 性能监控
    private updateCount: number = 0;
    private totalElementsObserved: number = 0;
    
    constructor(app: App) {
        this.app = app;
        this.setupIntersectionObserver();
        this.setupMutationObserver();
        this.registerEvents();
    }
    
    /**
     * 设置交叉观察器
     */
    private setupIntersectionObserver(): void {
        // 配置观察器选项
        const options = {
            root: null, // 相对于视口
            rootMargin: '100px', // 扩大观察区域以提前加载
            threshold: [0, 0.1, 0.5, 1.0] // 多个阈值以获得更精确的可见性变化
        };
        
        // 创建观察器实例
        this.intersectionObserver = new IntersectionObserver((entries) => {
            let changed = false;
            
            for (const entry of entries) {
                const id = entry.target.getAttribute('data-observer-id');
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
     * 设置DOM变化观察器
     */
    private setupMutationObserver(): void {
        this.mutationObserver = new MutationObserver(this.handleMutations.bind(this));
    }
    
    /**
     * 开始观察DOM变化
     * @param target 需要观察的目标元素
     * @param options 观察选项
     */
    public observeDOM(target: HTMLElement, options: MutationObserverInit = { childList: true, subtree: true }): void {
        if (this.mutationObserver) {
            this.mutationObserver.observe(target, options);
        }
    }
    
    /**
     * 处理DOM变化事件
     */
    private handleMutations(mutations: MutationRecord[]): void {
        let needUpdate = false;
        
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                // 检查新增的节点是否符合要关注的条件
                for (const node of Array.from(mutation.addedNodes)) {
                    if (node instanceof HTMLElement) {
                        const hasFileItems = node.querySelector('.nav-file-title') !== null;
                        const hasInternalLinks = node.querySelector('.cm-hmd-internal-link') !== null;
                        
                        if (hasFileItems || hasInternalLinks) {
                            needUpdate = true;
                            break;
                        }
                    }
                }
            }
            
            if (needUpdate) break;
        }
        
        if (needUpdate) {
            // 延迟处理以确保DOM完全更新
            setTimeout(() => {
                this.scanCurrentView();
                this.notifyDOMChangeListeners();
            }, 50);
        }
    }
    
    /**
     * 通知DOM变更监听器
     */
    private notifyDOMChangeListeners(): void {
        for (const listener of this.domChangeListeners) {
            listener();
        }
    }
    
    /**
     * 更新可见元素列表并通知监听器
     */
    private updateVisibleElements(): void {
        // 过滤出可见元素
        this.visibleElements = Array.from(this.elements.values())
            .filter(element => element.visible);
        
        // 通知所有监听器
        for (const listener of this.visibilityChangeListeners) {
            listener(this.visibleElements);
        }
        
        // 记录性能指标
        this.updateCount++;
    }
    
    /**
     * 注册工作区事件
     */
    private registerEvents(): void {
        this.app.workspace.onLayoutReady(() => {
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
            this.app.workspace.on('editor-change', debounceFn(() => {
                this.scanCurrentView();
            }, 200));
            
            // 窗口大小改变时重新计算视口
            window.addEventListener('resize', debounceFn(() => {
                this.recalculateVisibility();
            }, 200));
            
            // 观察文件树容器
            const fileExplorer = document.querySelector('.nav-files-container');
            if (fileExplorer && fileExplorer instanceof HTMLElement) {
                this.observeDOM(fileExplorer);
            }
            
            // 初始扫描
            this.handleActiveLeafChange();
        });
    }
    
    /**
     * 处理活动叶子的变化
     */
    private handleActiveLeafChange(): void {
        // 获取当前活动叶子
        this.activeLeaf = this.app.workspace.activeLeaf;
        
        // 扫描当前视图
        this.scanCurrentView();
    }
    
    /**
     * 扫描当前视图中的元素
     */
    public scanCurrentView(): void {
        // 清空当前元素集合
        this.clearElements();
        
        // 获取当前活动的Markdown视图
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        
        // 获取编辑器DOM
        const editorEl = (view.editor as any).cm?.dom;
        if (!editorEl) return;
        
        // 获取当前文件路径
        const filePath = view.file?.path || '';
        
        // 扫描各种类型的元素
        this.scanElements(editorEl, '.cm-hmd-internal-link', filePath, 'internal-link');
        this.scanElements(editorEl, '.cm-formatting-link', filePath, 'formatting-link');
        this.scanElements(editorEl, '.cm-url', filePath, 'url');
    }
    
    /**
     * 扫描指定容器中的所有匹配元素
     */
    public scanElements(container: HTMLElement, selector: string, path: string, type: string): void {
        const elements = container.querySelectorAll(selector);
        
        elements.forEach((el: HTMLElement, index: number) => {
            const id = `${type}-${selector}-${path}-${index}`;
            
            this.trackElement({
                id: id,
                element: el,
                path: path,
                visible: false,
                type: type
            });
        });
        
        // 扫描后强制更新可见性
        this.recalculateVisibility();
    }
    
    /**
     * 开始追踪元素可见性
     */
    public trackElement(element: ObservedElement): void {
        // 如果元素已存在，先停止追踪
        if (this.elements.has(element.id)) {
            this.untrackElement(element.id);
        }
        
        // 设置元素ID属性以便在观察器回调中识别
        element.element.setAttribute('data-observer-id', element.id);
        
        // 添加到元素映射中
        this.elements.set(element.id, element);
        
        // 将元素添加到观察器
        if (this.intersectionObserver) {
            this.intersectionObserver.observe(element.element);
            this.totalElementsObserved++;
        }
    }
    
    /**
     * 停止追踪元素可见性
     */
    public untrackElement(id: string): void {
        const element = this.elements.get(id);
        if (!element) return;
        
        // 从观察器移除
        if (this.intersectionObserver) {
            this.intersectionObserver.unobserve(element.element);
        }
        
        // 移除元素ID属性
        element.element.removeAttribute('data-observer-id');
        
        // 从映射中移除
        this.elements.delete(id);
        
        // 更新可见元素列表
        this.updateVisibleElements();
    }
    
    /**
     * 清空所有被追踪的元素
     */
    public clearElements(): void {
        // 从观察器中移除所有元素
        if (this.intersectionObserver) {
            for (const element of this.elements.values()) {
                this.intersectionObserver.unobserve(element.element);
                element.element.removeAttribute('data-observer-id');
            }
        }
        
        // 清空映射
        this.elements.clear();
        
        // 更新可见元素列表
        this.updateVisibleElements();
    }
    
    /**
     * 添加可见性变更监听器
     */
    public addVisibilityChangeListener(listener: VisibilityChangeListener): void {
        this.visibilityChangeListeners.add(listener);
    }
    
    /**
     * 移除可见性变更监听器
     */
    public removeVisibilityChangeListener(listener: VisibilityChangeListener): void {
        this.visibilityChangeListeners.delete(listener);
    }
    
    /**
     * 添加DOM变更监听器
     */
    public addDOMChangeListener(listener: DOMChangeListener): void {
        this.domChangeListeners.add(listener);
    }
    
    /**
     * 移除DOM变更监听器
     */
    public removeDOMChangeListener(listener: DOMChangeListener): void {
        this.domChangeListeners.delete(listener);
    }
    
    /**
     * 重新计算所有元素的可见性
     */
    public recalculateVisibility(): void {
        // 优化：只对存在的元素调用IntersectionObserver的方法
        if (this.intersectionObserver && this.elements.size > 0) {
            for (const element of this.elements.values()) {
                // 强制重新计算每个元素的可见性
                this.intersectionObserver.unobserve(element.element);
                this.intersectionObserver.observe(element.element);
            }
        }
    }
    
    /**
     * 获取当前可见的元素
     */
    public getVisibleElements(type?: string): ObservedElement[] {
        if (type) {
            return this.visibleElements.filter(el => el.type === type);
        }
        return this.visibleElements;
    }
    
    /**
     * 获取性能统计数据
     */
    public getStats(): { elementCount: number; visibleCount: number; updateCount: number; totalObserved: number } {
        return {
            elementCount: this.elements.size,
            visibleCount: this.visibleElements.length,
            updateCount: this.updateCount,
            totalObserved: this.totalElementsObserved
        };
    }
    
    /**
     * 获取可见元素与总元素的比例
     * @param type 可选的元素类型过滤
     * @returns 可见比例，范围从0到1
     */
    public getVisibilityRatio(type?: string): number {
        const totalElements = type 
            ? Array.from(this.elements.values()).filter(el => el.type === type).length
            : this.elements.size;
            
        const visibleCount = type
            ? this.visibleElements.filter(el => el.type === type).length
            : this.visibleElements.length;
            
        return totalElements > 0 ? visibleCount / totalElements : 0;
    }
    
    /**
     * 销毁观察器并清理资源
     */
    public destroy(): void {
        // 清除所有元素
        this.clearElements();
        
        // 断开观察器连接
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = null;
        }
        
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        
        // 移除事件监听
        window.removeEventListener('resize', this.recalculateVisibility.bind(this));
        
        // 清空监听器
        this.visibilityChangeListeners.clear();
        this.domChangeListeners.clear();
    }
} 