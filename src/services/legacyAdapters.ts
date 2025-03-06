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

export interface ViewportElement {
    id: string;
    element: HTMLElement;
    path: string;
    visible: boolean;
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
 * VisibilityTracker适配器
 */
export class VisibilityTracker {
    private app: App;
    private observer: UnifiedDOMObserver | null;
    private changeListeners: Set<VisibilityChangeListener> = new Set();
    
    constructor(app: App) {
        this.app = app;
        this.observer = getObserver();
        
        if (this.observer) {
            this.observer.addVisibilityChangeListener(this.handleUnifiedChange.bind(this));
        }
    }
    
    private handleUnifiedChange(elements: ObservedElement[]): void {
        // 转换为旧版格式，仅保留内部链接
        const visibleElements: VisibleElement[] = elements
            .filter(el => el.type === 'internal-link')
            .map(el => ({
                id: el.id,
                element: el.element,
                path: el.path,
                visible: el.visible
            }));
        
        // 通知旧版监听器
        for (const listener of this.changeListeners) {
            listener(visibleElements);
        }
    }
    
    public scanCurrentView(): void {
        this.observer?.scanCurrentView();
    }
    
    public scanElements(container: HTMLElement, selector: string, path: string): void {
        this.observer?.scanElements(container, selector, path, 'internal-link');
    }
    
    public trackElement(element: VisibleElement): void {
        this.observer?.trackElement({
            ...element,
            type: 'internal-link'
        });
    }
    
    public untrackElement(id: string): void {
        this.observer?.untrackElement(id);
    }
    
    public clearElements(): void {
        this.observer?.clearElements();
    }
    
    public addChangeListener(listener: VisibilityChangeListener): void {
        this.changeListeners.add(listener);
    }
    
    public removeChangeListener(listener: VisibilityChangeListener): void {
        this.changeListeners.delete(listener);
    }
    
    public recalculateVisibility(): void {
        this.observer?.recalculateVisibility();
    }
    
    public getVisibleElements(): VisibleElement[] {
        if (this.observer) {
            return this.observer.getVisibleElements('internal-link')
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
    
    public destroy(): void {
        if (this.observer) {
            this.observer.removeVisibilityChangeListener(this.handleUnifiedChange.bind(this));
        }
        this.changeListeners.clear();
    }
}

/**
 * EditorViewport适配器
 */
export class EditorViewport {
    private app: App;
    private observer: UnifiedDOMObserver | null;
    private changeListeners: Set<ViewportChangeListener> = new Set();
    
    constructor(app: App) {
        this.app = app;
        this.observer = getObserver();
        
        if (this.observer) {
            this.observer.addVisibilityChangeListener(this.handleUnifiedChange.bind(this));
        }
    }
    
    private handleUnifiedChange(elements: ObservedElement[]): void {
        // 转换为旧版格式，包含所有元素
        const viewportElements: ViewportElement[] = elements.map(el => ({
            id: el.id,
            element: el.element,
            path: el.path,
            visible: el.visible
        }));
        
        for (const listener of this.changeListeners) {
            listener(viewportElements);
        }
    }
    
    public scanCurrentView(): void {
        this.observer?.scanCurrentView();
    }
    
    public registerElement(element: ViewportElement): void {
        this.observer?.trackElement({
            ...element,
            type: 'viewport-element'
        });
    }
    
    public unregisterElement(id: string): void {
        this.observer?.untrackElement(id);
    }
    
    public clearElements(): void {
        this.observer?.clearElements();
    }
    
    public addChangeListener(listener: ViewportChangeListener): void {
        this.changeListeners.add(listener);
    }
    
    public removeChangeListener(listener: ViewportChangeListener): void {
        this.changeListeners.delete(listener);
    }
    
    public recalculateViewport(): void {
        this.observer?.recalculateVisibility();
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
    
    public destroy(): void {
        if (this.observer) {
            this.observer.removeVisibilityChangeListener(this.handleUnifiedChange.bind(this));
        }
        this.changeListeners.clear();
    }
} 