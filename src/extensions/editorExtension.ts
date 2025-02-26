import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { StateField, RangeSetBuilder } from '@codemirror/state';
import { FileDisplayPluginSettings } from '../types';

// 自定义链接部件
export class EnhancedLinkWidget extends WidgetType {
    constructor(
        readonly displayText: string, 
        readonly originalText: string, 
        readonly settings: FileDisplayPluginSettings
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

// 创建编辑器扩展
export function createEditorExtension(plugin: any) {
    // 添加状态字段来缓存链接位置
    const linkCache = StateField.define<DecorationSet>({
        create() {
            return Decoration.none;
        },
        update(oldState, tr) {
            if (!plugin.settings.enablePlugin) {
                return Decoration.none;
            }

            // 只在文档变化或首次加载时更新
            if (!tr.docChanged && oldState.size) {
                return oldState;
            }

            const builder = new RangeSetBuilder<Decoration>();
            const doc = tr.state.doc;

            // 遍历文档查找链接
            let inCodeBlock = false;
            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i);
                const text = line.text;

                // 检查是否在代码块内
                if (text.startsWith("```")) {
                    inCodeBlock = !inCodeBlock;
                    continue;
                }

                // 跳过代码块内容
                if (inCodeBlock) continue;

                // 使用正则匹配所有可能的链接格式
                const linkRegex = /\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^\)]+)\)/g;
                let match;

                while ((match = linkRegex.exec(text)) !== null) {
                    try {
                        const linkText = match[1] || match[2];
                        const from = line.from + match.index + (match[1] ? 2 : 1);
                        const to = from + linkText.length;

                        // 获取新的显示名称
                        const newName = plugin.getUpdatedFileName(linkText);
                        
                        if (newName && newName !== linkText) {
                            // 创建链接装饰器
                            builder.add(from, to, Decoration.replace({
                                widget: new EnhancedLinkWidget(newName, linkText, plugin.settings)
                            }));
                        }
                    } catch (error) {
                        console.error("处理链接失败:", error);
                    }
                }
            }

            return builder.finish();
        },
        provide: field => EditorView.decorations.from(field)
    });

    // 添加相应的CSS样式
    const linkStyles = EditorView.baseTheme({
        '.enhanced-link-widget': {
            position: 'relative',
            display: 'inline-block'
        },
        '.link-display': {
            color: 'var(--text-accent)',
            textDecoration: 'none',
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

    return [linkCache, linkStyles];
}  
