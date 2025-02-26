/**
 * 链接部件模块
 * 用于在编辑器中显示自定义链接
 */
import { WidgetType } from '@codemirror/view';
import { EditorView } from '@codemirror/view';

interface LinkWidgetSettings {
    showOriginalNameOnHover: boolean;
}

/**
 * 基础链接部件
 */
export class LinkWidget extends WidgetType {
    constructor(readonly displayText: string, readonly originalText: string) {
        super();
    }

    toDOM() {
        const span = document.createElement('span');
        span.textContent = this.displayText;
        span.className = 'cm-link';
        // 保存原始文本用于复制等操作
        span.setAttribute('data-original-text', this.originalText);
        return span;
    }

    ignoreEvent() {
        return false;
    }
}

/**
 * 增强型链接部件，支持悬停显示原始名称
 */
export class EnhancedLinkWidget extends WidgetType {
    constructor(
        readonly displayText: string, 
        readonly originalText: string, 
        readonly settings: LinkWidgetSettings
    ) {
        super();
    }

    toDOM() {
        const container = document.createElement('span');
        container.className = 'enhanced-link-widget';
        
        // 显示新名称
        const display = document.createElement('span');
        display.textContent = this.displayText;
        display.className = 'link-display cm-hmd-internal-link';
        container.appendChild(display);

        // 根据设置决定是否添加提示
        if (this.settings.showOriginalNameOnHover) {
            const tooltip = document.createElement('span');
            tooltip.textContent = this.originalText;
            tooltip.className = 'link-tooltip';
            container.appendChild(tooltip);
        }

        // 保存原始文本用于复制等操作
        container.dataset.originalText = this.originalText;

        return container;
    }

    eq(other: EnhancedLinkWidget): boolean {
        return other.displayText === this.displayText && 
               other.originalText === this.originalText &&
               other.settings.showOriginalNameOnHover === this.settings.showOriginalNameOnHover;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

/**
 * 链接部件相关的CSS样式
 */
export const linkWidgetStyles = EditorView.baseTheme({
    '.enhanced-link-widget': {
        position: 'relative',
        display: 'inline-block'
    },
    '.link-display': {
        color: 'var(--text-accent)',
        textDecoration: 'underline',
        cursor: 'pointer'
    },
    '.link-tooltip': {
        display: 'none',
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '4px 8px',
        backgroundColor: 'var(--background-modifier-hover)',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: '100'
    },
    '.enhanced-link-widget:hover .link-tooltip': {
        display: 'block'
    }
});  
