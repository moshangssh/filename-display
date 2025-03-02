/**
 * 链接部件模块
 * 用于在编辑器中显示自定义链接
 */
import { WidgetType } from '@codemirror/view';
import { DOMUtils } from '../utils/domUtils';
import { widgetStyles } from '../styles/widgetStyles';

interface LinkWidgetSettings {
    showOriginalNameOnHover: boolean;
}

/**
 * 基础部件类
 * 提供通用的部件创建和事件处理方法
 */
export class BaseWidget extends WidgetType {
    constructor(
        readonly displayText: string, 
        readonly originalText: string
    ) {
        super();
    }

    /**
     * 创建基础容器元素
     * @param className 容器类名
     * @returns HTMLElement 容器元素
     */
    protected createContainer(className: string): HTMLSpanElement {
        const container = DOMUtils.createSpan(className);
        container.dataset.originalText = this.originalText;
        return container;
    }
    
    /**
     * 创建显示元素
     * @param className 显示元素类名
     * @returns HTMLElement 显示元素
     */
    protected createDisplayElement(className: string): HTMLSpanElement {
        return DOMUtils.createSpan(className, this.displayText);
    }
    
    /**
     * 创建提示元素
     * @param className 提示元素类名
     * @returns HTMLElement 提示元素
     */
    protected createTooltipElement(className: string): HTMLSpanElement {
        return DOMUtils.createSpan(className, this.originalText);
    }
    
    /**
     * 默认的DOM创建方法，子类需要覆盖此方法
     */
    toDOM(): HTMLElement {
        const span = DOMUtils.createSpan('cm-link', this.displayText);
        span.dataset.originalText = this.originalText;
        return span;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

/**
 * 基础链接部件
 */
export class LinkWidget extends BaseWidget {
    constructor(readonly displayText: string, readonly originalText: string) {
        super(displayText, originalText);
    }

    toDOM(): HTMLElement {
        return super.toDOM();
    }
}

/**
 * 增强型链接部件，支持悬停显示原始名称
 */
export class EnhancedLinkWidget extends BaseWidget {
    constructor(
        readonly displayText: string, 
        readonly originalText: string, 
        readonly settings: LinkWidgetSettings
    ) {
        super(displayText, originalText);
    }

    toDOM(): HTMLElement {
        const container = this.createContainer('enhanced-link-widget');
        
        // 显示新名称
        const display = this.createDisplayElement('link-display cm-hmd-internal-link');
        container.appendChild(display);

        // 根据设置决定是否添加提示
        if (this.settings.showOriginalNameOnHover) {
            const tooltip = this.createTooltipElement('link-tooltip');
            container.appendChild(tooltip);
        }

        return container;
    }

    eq(other: EnhancedLinkWidget): boolean {
        return other.displayText === this.displayText && 
               other.originalText === this.originalText &&
               other.settings.showOriginalNameOnHover === this.settings.showOriginalNameOnHover;
    }
}

/**
 * 导出统一的部件样式
 */
export { widgetStyles };  