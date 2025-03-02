/**
 * DOM 工具类
 * 提供通用的 DOM 创建和操作方法
 */
export class DOMUtils {
    /**
     * 创建元素
     * @param tag 标签名称
     * @param className 类名
     * @param textContent 文本内容
     * @param attributes 属性对象
     * @returns HTMLElement
     */
    static createElement<K extends keyof HTMLElementTagNameMap>(
        tag: K,
        className?: string,
        textContent?: string,
        attributes?: Record<string, string>
    ): HTMLElementTagNameMap[K] {
        const element = document.createElement(tag);
        
        if (className) {
            element.className = className;
        }
        
        if (textContent) {
            element.textContent = textContent;
        }
        
        if (attributes) {
            Object.entries(attributes).forEach(([key, value]) => {
                if (key === 'dataset') {
                    Object.entries(value as unknown as Record<string, string>).forEach(
                        ([dataKey, dataValue]) => {
                            element.dataset[dataKey] = dataValue;
                        }
                    );
                } else {
                    element.setAttribute(key, value);
                }
            });
        }
        
        return element;
    }
    
    /**
     * 创建文档片段
     * @param elements 元素数组
     * @returns DocumentFragment
     */
    static createFragment(elements: HTMLElement[]): DocumentFragment {
        const fragment = document.createDocumentFragment();
        elements.forEach(el => fragment.appendChild(el));
        return fragment;
    }
    
    /**
     * 添加子元素
     * @param parent 父元素
     * @param children 子元素数组
     * @returns 父元素
     */
    static appendChildren<T extends HTMLElement>(parent: T, children: HTMLElement[]): T {
        children.forEach(child => parent.appendChild(child));
        return parent;
    }
    
    /**
     * 设置元素属性
     * @param element 目标元素
     * @param attributes 属性对象
     * @returns 目标元素
     */
    static setAttributes<T extends HTMLElement>(
        element: T, 
        attributes: Record<string, string>
    ): T {
        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
        return element;
    }
    
    /**
     * 设置数据属性
     * @param element 目标元素
     * @param dataset 数据属性对象
     * @returns 目标元素
     */
    static setDataset<T extends HTMLElement>(
        element: T, 
        dataset: Record<string, string>
    ): T {
        Object.entries(dataset).forEach(([key, value]) => {
            element.dataset[key] = value;
        });
        return element;
    }
    
    /**
     * 创建带有特定类名的 span 元素
     * @param className 类名
     * @param textContent 文本内容
     * @param attributes 属性对象
     * @returns HTMLSpanElement
     */
    static createSpan(
        className?: string, 
        textContent?: string, 
        attributes?: Record<string, string>
    ): HTMLSpanElement {
        return this.createElement('span', className, textContent, attributes);
    }
    
    /**
     * 创建带有特定类名的 div 元素
     * @param className 类名
     * @param textContent 文本内容
     * @param attributes 属性对象
     * @returns HTMLDivElement
     */
    static createDiv(
        className?: string, 
        textContent?: string, 
        attributes?: Record<string, string>
    ): HTMLDivElement {
        return this.createElement('div', className, textContent, attributes);
    }
    
    /**
     * 查找或创建元素
     * @param selector 选择器
     * @param parent 父元素
     * @param createFn 创建函数
     * @returns 找到的元素或新创建的元素
     */
    static findOrCreate<T extends HTMLElement>(
        selector: string,
        parent: HTMLElement,
        createFn: () => T
    ): T {
        const existing = parent.querySelector(selector);
        if (existing) {
            return existing as T;
        }
        const newElement = createFn();
        parent.appendChild(newElement);
        return newElement;
    }
} 