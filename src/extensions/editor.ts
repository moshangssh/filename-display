import { Extension } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, ViewPlugin, ViewUpdate, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import type { ITitleExtractorPlugin } from '../types';
import { Logger } from '../utils/logger';
import { viewportExtension } from './viewport';
import { incrementalUpdateExtension } from './incremental-update';
import { editorSyncExtension } from './editor-sync';

// 创建服务特定的日志记录器
const logger = new Logger('EditorExtensions');

/**
 * 链接替换小部件
 * 用于在编辑器中替换链接文本
 */
export class LinkReplaceWidget extends WidgetType {
    private readonly plugin: ITitleExtractorPlugin;
    private clickListener: ((event: MouseEvent) => void) | null = null;
    // 链接DOM引用
    private spanElement: HTMLElement | null = null;
    // 跟踪小部件是否已被销毁
    private isDestroyed: boolean = false;
    
    constructor(
        private readonly displayName: string, 
        private readonly originalPath: string, 
        plugin: ITitleExtractorPlugin
    ) {
        super();
        this.plugin = plugin;
        // 构造函数中不创建DOM或添加事件监听器，这些操作推迟到toDOM中
    }

    toDOM() {
        // 防御性检查：如果已被销毁则返回空span
        if (this.isDestroyed) {
            const emptySpan = document.createElement('span');
            emptySpan.className = 'cm-link cm-hmd-internal-link filename-display-destroyed';
            return emptySpan;
        }
        
        const span = document.createElement('span');
        span.className = 'cm-link cm-underline cm-hmd-internal-link filename-display-replaced';
        span.textContent = this.displayName;
        
        // 保留链接可点击性
        span.dataset.originalPath = this.originalPath;
        span.style.cursor = 'pointer';
        
        // 新增：平滑过渡效果
        span.style.transition = 'opacity 0.15s ease-in';
        
        // 创建点击事件监听器函数
        this.clickListener = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation(); // 阻止事件冒泡
            
            // 防御性检查：如果已被销毁或插件不可用则不执行操作
            if (this.isDestroyed || !this.plugin || !this.plugin.app) {
                return;
            }
            
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
        
        // 保存引用用于更新
        this.spanElement = span;
        
        return span;
    }

    destroy(dom: HTMLElement | null): void {
        // 标记为已销毁
        this.isDestroyed = true;
        
        // 清理事件监听器
        if (this.clickListener && this.spanElement) {
            this.spanElement.removeEventListener('click', this.clickListener);
            this.clickListener = null;
        }
        
        // 清除DOM引用
        this.spanElement = null;
    }

    ignoreEvent() {
        return false;
    }
    
    // 更新文本内容方法
    updateText(newDisplayName: string): void {
        // 防御性检查：如果已被销毁则不执行更新
        if (this.isDestroyed) {
            return;
        }
        
        if (this.spanElement) {
            // 应用平滑过渡
            this.spanElement.style.opacity = '0';
            
            // 使用requestAnimationFrame替代setTimeout，更符合浏览器渲染机制
            requestAnimationFrame(() => {
                // 再次检查组件是否已被销毁
                if (this.isDestroyed || !this.spanElement) {
                    return;
                }
                
                this.spanElement.textContent = newDisplayName;
                this.spanElement.style.opacity = '1';
            });
        }
    }

    // 添加eq方法以优化重新渲染
    eq(other: LinkReplaceWidget): boolean {
        // 如果小部件已被销毁，则始终返回false触发完全重新渲染
        if (this.isDestroyed) {
            return false;
        }
        
        // 只有当显示名称和原始路径都相同时才认为两个小部件相等
        return this.displayName === other.displayName && 
               this.originalPath === other.originalPath;
    }
}

/**
 * 状态效果 - 用于添加和移除装饰
 */
export const addLinkDecoration = StateEffect.define<{ from: number; to: number; widget: LinkReplaceWidget }>();
export const removeLinkDecoration = StateEffect.define<null>();
// 新增：用于更新已有链接的文本
export const updateLinkText = StateEffect.define<{ from: number; to: number; displayName: string }>();

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
        
        // 如果文档发生大规模变化(例如编辑器完全替换内容)，清理所有小部件以避免内存泄漏
        if (tr.changes.desc?.length && tr.newDoc.length < tr.startState.doc.length / 2) {
            // 在清理前手动调用所有小部件的destroy方法
            decorations.between(0, tr.startState.doc.length, (from, to, deco) => {
                if (deco.spec.widget instanceof LinkReplaceWidget) {
                    const widget = deco.spec.widget as LinkReplaceWidget;
                    // 传入null作为dom参数
                    widget.destroy(null);
                }
                return false;
            });
            // 清空所有装饰
            decorations = Decoration.none;
        }
        
        // 处理装饰效果
        for (const effect of tr.effects) {
            // 清除所有装饰
            if (effect.is(removeLinkDecoration)) {
                // 在清理前手动调用所有小部件的destroy方法
                decorations.between(0, tr.state.doc.length, (from, to, deco) => {
                    if (deco.spec.widget instanceof LinkReplaceWidget) {
                        const widget = deco.spec.widget as LinkReplaceWidget;
                        // 传入null作为dom参数
                        widget.destroy(null);
                    }
                    return false;
                });
                decorations = Decoration.none;
            }
            // 添加新装饰
            else if (effect.is(addLinkDecoration)) {
                const { from, to, widget } = effect.value;
                const decoration = Decoration.replace({
                    widget: widget,
                    inclusive: false
                }).range(from, to);
                
                // 检查是否已经存在相同位置的装饰，如果有则先清理它们
                // 存储需要移除的装饰位置
                const overlappingPositions: {from: number, to: number}[] = [];
                
                decorations.between(from, to, (start, end, deco) => {
                    if (deco.spec.widget instanceof LinkReplaceWidget) {
                        const widget = deco.spec.widget as LinkReplaceWidget;
                        widget.destroy(null);
                        overlappingPositions.push({from: start, to: end});
                    }
                    return false;
                });
                
                // 如果有重叠装饰，先移除它们
                if (overlappingPositions.length > 0) {
                    // 使用filter方法移除重叠的装饰
                    decorations = decorations.update({ 
                        filter: (dfrom, dto) => {
                            // 检查该位置是否在我们要移除的范围内
                            return !overlappingPositions.some(
                                pos => pos.from === dfrom && pos.to === dto
                            );
                        } 
                    });
                }
                
                // 添加新装饰
                decorations = decorations.update({ add: [decoration], sort: true });
            }
            // 处理更新文本效果
            else if (effect.is(updateLinkText)) {
                const { from, to, displayName } = effect.value;
                
                // 查找给定范围的装饰
                let foundDecoration = false;
                decorations.between(from, to, (start, end, deco) => {
                    // 如果找到装饰并且是我们期望的LinkReplaceWidget类型
                    if (deco.spec.widget instanceof LinkReplaceWidget) {
                        // 更新小部件的文本
                        deco.spec.widget.updateText(displayName);
                        foundDecoration = true;
                    }
                    return false; // 继续搜索
                });
                
                // 如果没有找到现有装饰，可能是因为它刚刚被创建但还未渲染
                // 这种情况我们不做任何处理，等待下一次更新
            }
        }
        
        return decorations;
    },
    // 添加 toJSON 方法以支持序列化(CodeMirror建议)
    toJSON() {
        return null; // 或返回适当的序列化格式
    },
    provide(field) {
        return EditorView.decorations.from(field);
    }
});

/**
 * 创建监视文档变化的扩展
 */
export function createLinkObserverExtension(
    plugin: ITitleExtractorPlugin, 
    onChange: (view: EditorView) => void
): Extension {
    return ViewPlugin.fromClass(
        class LinkObserver {
            constructor(private view: EditorView) {
                // 在构造函数中立即触发一次处理，确保首次加载时处理链接
                setTimeout(() => onChange(view), 100);
            }
            
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
    plugin: ITitleExtractorPlugin, 
    onChange: (view: EditorView) => void
): Extension {
    return [
        linkDecorationField,
        createLinkObserverExtension(plugin, onChange)
    ];
}

/**
 * 小部件清理扩展 - 用于跟踪和清理不再使用的小部件
 */
export const widgetCleanupExtension = ViewPlugin.fromClass(class WidgetCleanupPlugin {
    private activeWidgets: Set<LinkReplaceWidget> = new Set();
    private logger = new Logger('WidgetCleanupPlugin');
    
    constructor(private view: EditorView) {
        this.logger.debug('小部件清理插件已初始化');
    }
    
    update(update: ViewUpdate) {
        // 检查文档或视口变化
        if (update.docChanged || update.viewportChanged) {
            // 创建当前活动的小部件集合
            const currentWidgets = new Set<LinkReplaceWidget>();
            
            // 从当前文档中扫描所有小部件
            const decorations = update.state.field(linkDecorationField);
            decorations.between(0, update.state.doc.length, (from, to, deco) => {
                if (deco.spec.widget instanceof LinkReplaceWidget) {
                    const widget = deco.spec.widget as LinkReplaceWidget;
                    currentWidgets.add(widget);
                }
                return false;
            });
            
            // 找出已经不再活动的小部件
            const toRemove: LinkReplaceWidget[] = [];
            this.activeWidgets.forEach(widget => {
                if (!currentWidgets.has(widget)) {
                    toRemove.push(widget);
                    widget.destroy(null);
                }
            });
            
            // 更新活动小部件集合
            toRemove.forEach(widget => {
                this.activeWidgets.delete(widget);
            });
            
            // 添加新的活动小部件
            currentWidgets.forEach(widget => {
                this.activeWidgets.add(widget);
            });
            
            if (toRemove.length > 0) {
                this.logger.debug(`已清理 ${toRemove.length} 个不再活动的小部件`);
            }
        }
    }
    
    destroy() {
        // 编辑器销毁时清理所有小部件
        this.logger.debug(`清理 ${this.activeWidgets.size} 个小部件`);
        this.activeWidgets.forEach(widget => widget.destroy(null));
        this.activeWidgets.clear();
    }
});

/**
 * 创建所有编辑器扩展的组合
 */
export function createEditorExtensions(plugin: ITitleExtractorPlugin): Extension {
    return [
        // 添加视口检测扩展
        viewportExtension(),
        // 添加增量更新扩展
        incrementalUpdateExtension(),
        // 添加编辑器状态同步扩展
        editorSyncExtension(plugin),
        // 添加链接观察器扩展
        createLinkObserverExtension(plugin, (view) => {
            // 处理链接变化
            logger.log('链接变化检测到');
        }),
        // 添加链接装饰扩展
        createLinkDecorationExtension(plugin, (view) => {
            // 处理装饰变化
            logger.log('装饰变化检测到');
        }),
        // 添加装饰状态字段
        linkDecorationField,
        // 添加小部件清理扩展
        widgetCleanupExtension,
    ];
}

// 新增：更新链接文本但保持装饰
export function updateLinkDisplayName(
    view: EditorView,
    from: number,
    to: number,
    displayName: string
): void {
    if (!view) return;
    
    try {
        view.dispatch({
            effects: updateLinkText.of({ from, to, displayName })
        });
    } catch (e) {
        logger.log('更新链接文本失败:', e);
    }
} 