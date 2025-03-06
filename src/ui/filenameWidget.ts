import { WidgetType } from '@codemirror/view';
import { DOMUtils } from '../utils/domUtils';

/**
 * 文件名装饰部件类，显示替换后的文件名
 */
export class FilenameDecorationWidget extends WidgetType {
    constructor(
        readonly displayText: string, 
        readonly originalText: string, 
        readonly showTooltip: boolean
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const container = document.createElement('span');
        container.className = 'filename-decoration-widget';
        container.dataset.originalText = this.originalText;
        
        // 显示新名称
        const display = document.createElement('span');
        display.className = 'filename-display cm-hmd-internal-link';
        display.textContent = this.displayText;
        container.appendChild(display);

        // 根据设置决定是否添加提示
        if (this.showTooltip) {
            container.setAttribute('title', this.originalText);
        }

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