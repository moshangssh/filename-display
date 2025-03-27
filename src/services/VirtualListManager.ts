import { TFile } from 'obsidian';
import { ILoggerService } from './interfaces/IServices';

/**
 * 虚拟列表配置接口
 */
interface VirtualListConfig {
    containerSelector: string;      // 容器选择器
    itemHeight: number;            // 每个项目的高度
    overscan: number;              // 可视区域外预渲染的项目数
    bufferSize: number;            // 缓冲区大小
}

/**
 * 虚拟列表管理器
 * 
 * 负责管理文件浏览器的虚拟列表功能，通过只渲染可见区域的内容来优化性能。
 * 
 * 主要功能：
 * 1. 计算可见区域
 * 2. 管理渲染项目
 * 3. 处理滚动事件
 * 4. 维护项目缓存
 */
export class VirtualListManager {
    private container: HTMLElement | null = null;
    private viewport: HTMLElement | null = null;
    private content: HTMLElement | null = null;
    private items: TFile[] = [];
    private visibleItems: Map<number, HTMLElement> = new Map();
    private scrollTop = 0;
    private resizeObserver: ResizeObserver | null = null;
    private isInitialized = false;

    // 默认配置
    private readonly defaultConfig: VirtualListConfig = {
        containerSelector: '.nav-files-container',
        itemHeight: 24,           // 默认项目高度
        overscan: 5,             // 上下各预渲染5个项目
        bufferSize: 50           // 缓冲区大小为50个项目
    };

    constructor(
        private config: Partial<VirtualListConfig>,
        private logger: ILoggerService
    ) {
        this.config = { ...this.defaultConfig, ...config };
    }

    /**
     * 初始化虚拟列表
     */
    public initialize(): void {
        if (this.isInitialized) return;

        const containerSelector = this.config.containerSelector || this.defaultConfig.containerSelector;
        this.container = document.querySelector<HTMLElement>(containerSelector);
        if (!this.container) {
            this.logger.warn('找不到文件浏览器容器');
            return;
        }

        // 创建视口和内容容器
        this.setupContainers();
        
        // 设置滚动监听
        this.setupScrollListener();
        
        // 设置大小变化监听
        this.setupResizeObserver();

        this.isInitialized = true;
        this.logger.info('虚拟列表初始化完成');
    }

    /**
     * 设置容器结构
     */
    private setupContainers(): void {
        if (!this.container) return;

        // 创建视口容器
        this.viewport = document.createElement('div');
        this.viewport.className = 'virtual-list-viewport';
        this.viewport.style.cssText = 'position: relative; overflow-y: auto; height: 100%;';

        // 创建内容容器
        this.content = document.createElement('div');
        this.content.className = 'virtual-list-content';
        this.content.style.cssText = 'position: absolute; width: 100%;';

        // 重构DOM结构
        const originalContent = this.container.innerHTML;
        this.container.innerHTML = '';
        this.viewport.appendChild(this.content);
        this.container.appendChild(this.viewport);
        this.content.innerHTML = originalContent;
    }

    /**
     * 设置滚动监听
     */
    private setupScrollListener(): void {
        if (!this.viewport) return;

        this.viewport.addEventListener('scroll', this.onScroll.bind(this));
    }

    /**
     * 设置大小变化监听
     */
    private setupResizeObserver(): void {
        this.resizeObserver = new ResizeObserver(() => {
            this.updateVisibleItems();
        });

        if (this.container) {
            this.resizeObserver.observe(this.container);
        }
    }

    /**
     * 滚动事件处理
     */
    private onScroll(): void {
        if (!this.viewport) return;
        
        const newScrollTop = this.viewport.scrollTop;
        if (newScrollTop !== this.scrollTop) {
            this.scrollTop = newScrollTop;
            this.updateVisibleItems();
        }
    }

    /**
     * 更新可见项目
     */
    private updateVisibleItems(): void {
        if (!this.viewport || !this.content) return;

        const itemHeight = this.config.itemHeight || this.defaultConfig.itemHeight;
        const overscan = this.config.overscan || this.defaultConfig.overscan;
        const viewportHeight = this.viewport.clientHeight;
        
        // 计算可见范围
        const startIndex = Math.max(0, Math.floor(this.scrollTop / itemHeight) - overscan);
        const endIndex = Math.min(
            this.items.length,
            Math.ceil((this.scrollTop + viewportHeight) / itemHeight) + overscan
        );

        // 更新内容高度
        this.content.style.height = `${this.items.length * itemHeight}px`;

        // 获取需要显示的项目
        const itemsToShow = new Set<number>();
        for (let i = startIndex; i < endIndex; i++) {
            itemsToShow.add(i);
        }

        // 移除不可见的项目
        for (const [index, element] of this.visibleItems.entries()) {
            if (!itemsToShow.has(index)) {
                element.remove();
                this.visibleItems.delete(index);
            }
        }

        // 添加新的可见项目
        for (const index of itemsToShow) {
            if (!this.visibleItems.has(index)) {
                const item = this.renderItem(this.items[index], index);
                if (item) {
                    item.style.position = 'absolute';
                    item.style.top = `${index * itemHeight}px`;
                    item.style.width = '100%';
                    this.content.appendChild(item);
                    this.visibleItems.set(index, item);
                }
            }
        }
    }

    /**
     * 渲染单个项目
     */
    private renderItem(file: TFile, index: number): HTMLElement | null {
        try {
            const item = document.createElement('div');
            item.className = 'nav-file-title';
            item.setAttribute('data-path', file.path);
            item.setAttribute('data-index', String(index));
            
            const content = document.createElement('div');
            content.className = 'nav-file-title-content';
            content.textContent = file.basename;
            
            item.appendChild(content);
            return item;
        } catch (error) {
            this.logger.error(`渲染项目 ${file.path} 时出错:`, error);
            return null;
        }
    }

    /**
     * 更新项目列表
     */
    public updateItems(newItems: TFile[]): void {
        this.items = newItems;
        this.updateVisibleItems();
    }

    /**
     * 销毁虚拟列表
     */
    public dispose(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        if (this.viewport) {
            this.viewport.removeEventListener('scroll', this.onScroll.bind(this));
        }

        this.visibleItems.clear();
        this.items = [];
        this.isInitialized = false;
    }
} 