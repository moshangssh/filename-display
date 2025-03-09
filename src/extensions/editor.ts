import { Extension } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, ViewPlugin, ViewUpdate, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import type { IFilenameDisplayPlugin } from '../types';
import { Logger } from '../utils/logger';

// 创建服务特定的日志记录器
const logger = new Logger('EditorExtensions');

/**
 * 链接替换小部件
 * 用于在编辑器中替换链接文本
 */
export class LinkReplaceWidget extends WidgetType {
    private readonly plugin: IFilenameDisplayPlugin;
    private clickListener: ((event: MouseEvent) => void) | null = null;
    
    constructor(private readonly displayName: string, private readonly originalPath: string, plugin: IFilenameDisplayPlugin) {
        super();
        this.plugin = plugin;
    }

    toDOM() {
        const span = document.createElement('span');
        span.className = 'cm-link cm-underline cm-hmd-internal-link filename-display-replaced';
        span.textContent = this.displayName;
        
        // 保留链接可点击性
        span.dataset.originalPath = this.originalPath;
        span.style.cursor = 'pointer';
        
        // 创建点击事件监听器函数
        this.clickListener = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation(); // 阻止事件冒泡
            // 使用Obsidian API打开链接
            const workspace = this.plugin.app.workspace;
            const path = this.originalPath;
            const file = this.plugin.app.vault.getAbstractFileByPath(path) || 
                        this.plugin.app.metadataCache.getFirstLinkpathDest(path, '');
            if (file) {
                workspace.openLinkText(this.originalPath, '', event.ctrlKey || event.metaKey);
            }
        };
        
        // 添加点击事件监听
        span.addEventListener('click', this.clickListener);
        
        return span;
    }

    destroy(dom: HTMLElement): void {
        // 在小部件被销毁时清理事件监听器
        if (this.clickListener && dom instanceof HTMLElement) {
            dom.removeEventListener('click', this.clickListener);
            this.clickListener = null;
        }
    }

    ignoreEvent() {
        return false;
    }
}

/**
 * 状态效果 - 用于添加和移除装饰
 */
export const addLinkDecoration = StateEffect.define<{ from: number; to: number; widget: LinkReplaceWidget }>();
export const removeLinkDecoration = StateEffect.define<null>();

/**
 * 装饰状态字段 - 管理编辑器中的装饰
 */
export const linkDecorationField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        // 处理文档变更
        decorations = decorations.map(tr.changes);
        
        // 处理装饰效果
        for (const effect of tr.effects) {
            // 清除所有装饰
            if (effect.is(removeLinkDecoration)) {
                decorations = Decoration.none;
            }
            // 添加新装饰
            else if (effect.is(addLinkDecoration)) {
                const { from, to, widget } = effect.value;
                const decoration = Decoration.replace({
                    widget: widget,
                    inclusive: false
                }).range(from, to);
                decorations = decorations.update({ add: [decoration], sort: true });
            }
        }
        
        return decorations;
    },
    provide(field) {
        return EditorView.decorations.from(field);
    }
});

/**
 * 创建监视文档变化的扩展
 */
export function createLinkObserverExtension(
    plugin: IFilenameDisplayPlugin, 
    onChange: (view: EditorView) => void
): Extension {
    return ViewPlugin.fromClass(
        class LinkObserver {
            constructor(private view: EditorView) {}
            
            update(update: ViewUpdate) {
                // 仅在文档内容变化时触发处理
                if (update.docChanged) {
                    onChange(this.view);
                }
            }
        }
    );
}

/**
 * 创建链接装饰扩展
 * 这是一个完整的扩展，包含状态字段和视图插件
 */
export function createLinkDecorationExtension(
    plugin: IFilenameDisplayPlugin, 
    onChange: (view: EditorView) => void
): Extension {
    return [
        linkDecorationField,
        createLinkObserverExtension(plugin, onChange)
    ];
}

/**
 * 创建所有编辑器扩展的组合
 */
export function createEditorExtensions(plugin: IFilenameDisplayPlugin): Extension {
    // 收集所有扩展
    const extensions: Extension[] = [];
    
    // 链接装饰扩展
    if (plugin.settings.enableEditorLinkDecorations) {
        const linkDecorationExt = createLinkDecorationExtension(plugin, (view) => {
            // 当编辑器内容变化时，通知装饰器
            if (plugin._linkDecorator) {
                plugin._linkDecorator.onEditorChange?.(view);
            }
        });
        extensions.push(linkDecorationExt);
    }
    
    return extensions;
} 