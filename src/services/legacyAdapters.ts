import { App } from 'obsidian';
import { 
    UnifiedDOMObserver, 
    ObservedElement, 
    VisibilityChangeListener as UnifiedChangeListener,
    DOMChangeListener
} from './unifiedDOMObserver';

/**
 * 兼容接口定义（保持原有API结构）
 */
export interface VisibleElement {
    id: string;
    element: HTMLElement;
    path: string;
    visible: boolean;
}

export interface ViewportElement extends VisibleElement {
    // ViewportElement现在完全继承VisibleElement，减少代码重复
}

export type VisibilityChangeListener = (visibleElements: VisibleElement[]) => void;
export type ViewportChangeListener = (visibleElements: ViewportElement[]) => void;

/**
 * 获取统一观察器实例
 * 简化代码，集中处理观察器获取和错误处理
 */
function getObserver(): UnifiedDOMObserver | null {
    const observer = window.activeUnifiedObserver;
    if (!observer) {
        console.warn('未找到活动的统一DOM观察器，功能可能受限');
    }
    return observer;
}

/**
 * DOMObserverService适配器
 */
export class DOMObserverService {
    private observer: UnifiedDOMObserver | null;
    private updateCallback: () => void;
    
    constructor(updateCallback: () => void) {
        this.updateCallback = updateCallback;
        this.observer = getObserver();
    }
    
    public observe(): () => void {
        if (this.observer) {
            // 添加DOM变更监听
            this.observer.addDOMChangeListener(this.updateCallback);
            
            // 观察文件树容器
            const fileExplorer = document.querySelector('.nav-files-container');
            if (fileExplorer && fileExplorer instanceof HTMLElement) {
                this.observer.observeDOM(fileExplorer);
            }
        }
        
        return () => this.disconnect();
    }
    
    public disconnect(): void {
        if (this.observer) {
            this.observer.removeDOMChangeListener(this.updateCallback);
        }
    }
}

/**
 * 通用视图元素适配器基类
 * 减少代码重复，由VisibilityTracker和EditorViewport继承
 */
abstract class BaseElementAdapter<T extends VisibleElement> {
    protected app: App;
    protected observer: UnifiedDOMObserver | null;
    protected changeListeners: Set<(elements: T[]) => void> = new Set();
    protected elementType: string;
    
    constructor(app: App, elementType: string) {
        this.app = app;
        this.elementType = elementType;
        this.observer = getObserver();
        
        if (this.observer) {
            this.observer.addVisibilityChangeListener(this.handleUnifiedChange.bind(this));
        }
    }
    
    protected abstract handleUnifiedChange(elements: ObservedElement[]): void;
    
    public scanCurrentView(): void {
        this.observer?.scanCurrentView();
    }
    
    public clearElements(): void {
        this.observer?.clearElements();
    }
    
    public recalculateVisibility(): void {
        this.observer?.recalculateVisibility();
    }
    
    public destroy(): void {
        if (this.observer) {
            this.observer.removeVisibilityChangeListener(this.handleUnifiedChange.bind(this));
        }
        this.changeListeners.clear();
    }
}

/**
 * VisibilityTracker适配器
 */
export class VisibilityTracker extends BaseElementAdapter<VisibleElement> {
    constructor(app: App) {
        super(app, 'internal-link');
    }
    
    protected handleUnifiedChange(elements: ObservedElement[]): void {
        // 转换为旧版格式，仅保留内部链接
        const visibleElements: VisibleElement[] = elements
            .filter(el => el.type === this.elementType)
            .map(el => ({
                id: el.id,
                element: el.element,
                path: el.path,
                visible: el.visible
            }));
        
        // 通知旧版监听器
        this.changeListeners.forEach(listener => listener(visibleElements));
    }
    
    public scanElements(container: HTMLElement, selector: string, path: string): void {
        this.observer?.scanElements(container, selector, path, this.elementType);
    }
    
    public trackElement(element: VisibleElement): void {
        this.observer?.trackElement({
            ...element,
            type: this.elementType
        });
    }
    
    public untrackElement(id: string): void {
        this.observer?.untrackElement(id);
    }
    
    public addChangeListener(listener: VisibilityChangeListener): void {
        this.changeListeners.add(listener);
    }
    
    public removeChangeListener(listener: VisibilityChangeListener): void {
        this.changeListeners.delete(listener);
    }
    
    public getVisibleElements(): VisibleElement[] {
        if (this.observer) {
            return this.observer.getVisibleElements(this.elementType)
                .map(el => ({
                    id: el.id,
                    element: el.element,
                    path: el.path,
                    visible: el.visible
                }));
        }
        return [];
    }
    
    public getStats(): { trackCount: number; visibleCount: number; totalObserved: number } {
        if (this.observer) {
            const stats = this.observer.getStats();
            return {
                trackCount: stats.elementCount,
                visibleCount: stats.visibleCount,
                totalObserved: stats.totalObserved
            };
        }
        return { trackCount: 0, visibleCount: 0, totalObserved: 0 };
    }
}

/**
 * EditorViewport适配器
 */
export class EditorViewport extends BaseElementAdapter<ViewportElement> {
    constructor(app: App) {
        super(app, 'viewport-element');
    }
    
    protected handleUnifiedChange(elements: ObservedElement[]): void {
        // 转换为旧版格式
        const viewportElements: ViewportElement[] = elements.map(el => ({
            id: el.id,
            element: el.element,
            path: el.path,
            visible: el.visible
        }));
        
        this.changeListeners.forEach(listener => listener(viewportElements));
    }
    
    public registerElement(element: ViewportElement): void {
        this.observer?.trackElement({
            ...element,
            type: this.elementType
        });
    }
    
    public unregisterElement(id: string): void {
        this.observer?.untrackElement(id);
    }
    
    public addChangeListener(listener: ViewportChangeListener): void {
        this.changeListeners.add(listener);
    }
    
    public removeChangeListener(listener: ViewportChangeListener): void {
        this.changeListeners.delete(listener);
    }
    
    public recalculateViewport(): void {
        this.recalculateVisibility();
    }
    
    public getVisibleElements(): ViewportElement[] {
        if (this.observer) {
            return this.observer.getVisibleElements()
                .map(el => ({
                    id: el.id,
                    element: el.element,
                    path: el.path,
                    visible: el.visible
                }));
        }
        return [];
    }
} 