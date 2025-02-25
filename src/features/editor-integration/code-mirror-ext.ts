import { EditorView, ViewPlugin, DecorationSet, Decoration, WidgetType } from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { MyPluginSettings } from '../../types/interfaces';
import { LinkWidget } from '../ui-components/link-widget';

export class CodeMirrorExtension {
    constructor(
        private settings: MyPluginSettings,
        private getUpdatedFileName: (name: string) => string | null
    ) {}

    createExtension() {
        const plugin = this;

        const linkCache = StateField.define<DecorationSet>({
            create() {
                return Decoration.none;
            },
            update(oldState, tr) {
                if (!plugin.settings.enablePlugin) {
                    return Decoration.none;
                }

                if (!tr.docChanged && oldState.size) {
                    return oldState;
                }

                const builder = new RangeSetBuilder<Decoration>();
                const doc = tr.state.doc;

                let inCodeBlock = false;
                for (let i = 1; i <= doc.lines; i++) {
                    const line = doc.line(i);
                    const text = line.text;

                    if (text.trim().startsWith("```")) {
                        inCodeBlock = !inCodeBlock;
                        continue;
                    }

                    if (inCodeBlock) continue;

                    const linkRegex = /\[\[([^\]|#]+)(?:\|[^\]]+)?(?:#[^\]]+)?\]\]|\[([^\]]+)\]\(([^\)]+)\)/g;
                    let match;

                    while ((match = linkRegex.exec(text)) !== null) {
                        try {
                            const linkText = match[1] || match[2];
                            if (!linkText) continue;
                            
                            const from = line.from + match.index + (match[1] ? 2 : 1);
                            const to = from + linkText.length;

                            const newName = plugin.getUpdatedFileName(linkText);
                            
                            if (newName && newName !== linkText) {
                                builder.add(from, to, Decoration.replace({
                                    widget: new LinkWidget(newName, linkText, plugin.settings)
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

        const linkStyles = EditorView.baseTheme({
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

        return [linkCache, linkStyles];
    }
}
