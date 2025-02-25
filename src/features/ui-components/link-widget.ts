import { WidgetType } from '@codemirror/view';
import { MyPluginSettings } from '../../types/interfaces';

export class LinkWidget extends WidgetType {
    constructor(
        readonly displayText: string,
        readonly originalText: string,
        readonly settings: MyPluginSettings
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const container = document.createElement('span');
        container.className = 'enhanced-link-widget';
        
        const display = document.createElement('span');
        display.textContent = this.displayText;
        display.className = 'link-display cm-hmd-internal-link';
        display.style.textDecoration = 'none';
        container.appendChild(display);

        if (this.settings.showOriginalNameOnHover) {
            const tooltip = document.createElement('span');
            tooltip.textContent = this.originalText;
            tooltip.className = 'link-tooltip';
            container.appendChild(tooltip);
        }

        container.dataset.originalText = this.originalText;
        return container;
    }

    eq(other: LinkWidget): boolean {
        return other.displayText === this.displayText && 
               other.originalText === this.originalText &&
               other.settings.showOriginalNameOnHover === this.settings.showOriginalNameOnHover;
    }

    ignoreEvent(): boolean {
        return false;
    }
}
