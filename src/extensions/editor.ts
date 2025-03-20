import { Extension } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, ViewPlugin, ViewUpdate, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import type { ITitleExtractorPlugin } from '../types';
import { LoggerService } from '../services/LoggerService';
import { viewportExtension } from './viewport';
import { incrementalUpdateExtension } from './incremental-update';
import { editorSyncExtension } from './editor-sync';
import { MarkdownView, editorViewField } from 'obsidian';
import { getEditorView } from '../utils/editor-utils';

// 创建服务特定的日志记录器
const logger = new LoggerService('EditorExtensions');

// 定义状态效果 - 用于更新小部件文本
export const updateTextEffect = StateEffect.define<{id: string, displayName: string}>();

/**
 * 链接替换小部件
 * 用于在编辑器中替换链接文本
 */
export class LinkReplaceWidget extends WidgetType {
    // 添加唯一ID用于识别小部件
    private readonly id: string;
    private readonly plugin: ITitleExtractorPlugin;
    // 跟踪小部件是否已被销毁
    private isDestroyed: boolean = false;
    // 跟踪DOM引用,便于清理
    private domElement: HTMLElement | null = null;
    // 跟踪小部件创建时间,用于性能分析和调试
    private readonly createdAt: number = Date.now();
    
    constructor(
        private readonly displayName: string, 
        private readonly originalPath: string, 
        plugin: ITitleExtractorPlugin
    ) {
        super();
        this.plugin = plugin;
        // 生成唯一ID，使用路径和时间戳组合
        this.id = `link-widget-${this.hashString(originalPath)}-${Date.now()}`;
    }

    // 简单的字符串哈希函数,用于生成更短的ID
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash).toString(36);
    }

    // 获取小部件ID
    getId(): string {
        return this.id;
    }
    
    // 获取原始路径
    getOriginalPath(): string {
        return this.originalPath;
    }
    
    // 获取显示名称
    getDisplayName(): string {
        return this.displayName;
    }
    
    // 获取插件实例
    getPlugin(): ITitleExtractorPlugin {
        return this.plugin;
    }

    // 获取创建时间
    getCreatedAt(): number {
        return this.createdAt;
    }

    // 检查小部件是否已销毁
    checkIsDestroyed(): boolean {
        return this.isDestroyed;
    }

    toDOM() {
        // 防御性检查：如果已被销毁则返回空span
        if (this.isDestroyed) {
            const emptySpan = document.createElement('span');
            emptySpan.className = 'cm-link cm-hmd-internal-link filename-display-destroyed';
            return emptySpan;
        }
        
        const span = document.createElement('span');
        span.className = 'cm-link cm-hmd-internal-link filename-display-replaced';
        span.textContent = this.displayName;
        
        // 保留链接可点击性
        span.dataset.originalPath = this.originalPath;
        span.dataset.widgetId = this.id; // 添加小部件ID到数据属性
        
        // 保存DOM引用便于清理
        this.domElement = span;
        
        return span;
    }

    // 实现es方法,允许CodeMirror用事务效果更新小部件
    public eq(other: LinkReplaceWidget): boolean {
        return this.id === other.id && 
               this.displayName === other.displayName &&
               this.originalPath === other.originalPath &&
               !this.isDestroyed;
    }

    destroy(dom: HTMLElement | null): void {
        if (this.isDestroyed) {
            return; // 避免重复销毁
        }
        
        // 标记为已销毁
        this.isDestroyed = true;
        
        // 清理DOM元素
        const elementToClean = dom || this.domElement;
        if (elementToClean) {
            // 移除事件监听
            elementToClean.removeAttribute('data-widget-id');
            elementToClean.removeAttribute('data-original-path');
            
            // 清除任何可能的内联样式
            elementToClean.removeAttribute('style');
            
            // 确保DOM元素不会保持对widget的引用
            elementToClean.textContent = elementToClean.textContent; // 触发内容刷新，确保内部引用被清除
        }
        
        // 清理自身DOM引用
        this.domElement = null;
        
        // 释放对插件的引用
        (this as any).plugin = null;
    }

    ignoreEvent() {
        return false;
    }
    
    // 使用纯函数式方式更新文本 - 通过状态效果
    updateText(newDisplayName: string): void {
        try {
            // 防御性检查：如果已被销毁则不执行更新
            if (this.isDestroyed) {
                return;
            }
            
            // 创建状态效果
            const effect = updateTextEffect.of({
                id: this.id,
                displayName: newDisplayName
            });
            
            // 通过事务分发效果
            if (this.plugin.app.workspace.activeLeaf?.view instanceof MarkdownView) {
                const view = this.plugin.app.workspace.activeLeaf.view as MarkdownView;
                
                // 使用规范化的工具函数获取编辑器视图
                const editorView = getEditorView(view);
                
                if (editorView instanceof EditorView) {
                    // 使用错误处理工具类封装操作
                    EditorErrorHandler.withErrorHandling(
                        () => editorView.dispatch({ effects: [effect] }),
                        EditorErrorType.WIDGET_UPDATE,
                        {
                            widgetId: this.id,
                            displayName: newDisplayName,
                            originalPath: this.originalPath
                        }
                    );
                } else {
                    throw new Error('无法获取有效的编辑器视图');
                }
            } else {
                // 记录无法获取编辑器视图的情况
                logger.warn(`无法更新小部件文本: 找不到活动的Markdown视图, ID: ${this.id}`);
            }
        } catch (error) {
            // 捕获并处理所有错误
            EditorErrorHandler.handleError(
                error as Error, 
                EditorErrorType.WIDGET_UPDATE, 
                {
                    widgetId: this.id,
                    displayName: newDisplayName,
                    originalPath: this.originalPath
                }
            );
        }
    }
}

/**
 * 状态效果 - 用于添加和移除装饰
 */
export const addLinkDecoration = StateEffect.define<{ from: number; to: number; widget: LinkReplaceWidget }>();
export const removeLinkDecoration = StateEffect.define<null>();
// 新增：用于更新已有链接的文本
export const updateLinkText = StateEffect.define<{ from: number; to: number; displayName: string }>();

// 定义小部件清理效果
export const cleanupWidgetsEffect = StateEffect.define<{ from: number; to: number }>({
  map: ({ from, to }, changes) => ({ from: changes.mapPos(from), to: changes.mapPos(to) })
});

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
            // 使用事务效果系统进行清理，而不是手动遍历调用destroy
            return Decoration.none;
        }
        
        // 处理装饰效果
        for (const effect of tr.effects) {
            // 清除所有装饰
            if (effect.is(removeLinkDecoration)) {
                return Decoration.none;
            }
            // 添加新装饰
            else if (effect.is(addLinkDecoration)) {
                const { from, to, widget } = effect.value;
                const decoration = Decoration.replace({
                    widget: widget,
                    inclusive: false
                }).range(from, to);
                
                // 检查是否已经存在相同位置的装饰，使用cleanupWidgetsEffect来清理
                const overlappingWidgets: {from: number, to: number}[] = [];
                
                decorations.between(from, to, (start, end, deco) => {
                    if (deco.spec.widget instanceof LinkReplaceWidget) {
                        overlappingWidgets.push({from: start, to: end});
                    }
                    return false;
                });
                
                // 如果有重叠装饰，先移除它们
                if (overlappingWidgets.length > 0) {
                    // 使用filter方法移除重叠的装饰
                    decorations = decorations.update({ 
                        filter: (dfrom, dto) => {
                            // 检查该位置是否在我们要移除的范围内
                            return !overlappingWidgets.some(
                                pos => pos.from === dfrom && pos.to === dto
                            );
                        } 
                    });
                }
                
                // 添加新装饰
                decorations = decorations.update({ add: [decoration], sort: true });
            }
            // 处理小部件清理效果
            else if (effect.is(cleanupWidgetsEffect)) {
                const { from, to } = effect.value;
                
                // 收集需要移除的小部件位置
                const toRemove: {from: number, to: number}[] = [];
                
                decorations.between(from, to, (start, end, deco) => {
                    if (deco.spec.widget instanceof LinkReplaceWidget) {
                        toRemove.push({from: start, to: end});
                    }
                    return false;
                });
                
                // 如果有需要移除的小部件，更新装饰集合
                if (toRemove.length > 0) {
                    decorations = decorations.update({
                        filter: (dfrom, dto) => {
                            return !toRemove.some(
                                pos => pos.from === dfrom && pos.to === dto
                            );
                        }
                    });
                }
            }
            // 处理更新文本效果 - 使用新的函数式方法
            else if (effect.is(updateLinkText)) {
                const { from, to, displayName } = effect.value;
                
                // 使用函数式方法更新装饰，而不是直接修改
                decorations = decorations.update({
                    filter: (fromPos, toPos, value) => {
                        // 保留所有不匹配的装饰
                        return !(fromPos === from && toPos === to);
                    },
                    add: [
                        Decoration.replace({
                            widget: new LinkReplaceWidget(
                                displayName,
                                // 我们需要先找到原始的链接
                                findOriginalPath(decorations, from, to),
                                (window as any).app.plugins.plugins['filename-display']
                            ),
                            inclusive: false
                        }).range(from, to)
                    ],
                    sort: true
                });
            }
            // 处理小部件文本更新效果 - 使用ID进行精确更新
            else if (effect.is(updateTextEffect)) {
                const { id, displayName } = effect.value;
                
                // 函数式方式：查找需要更新的装饰位置和数据
                const decorationsToUpdate: { from: number; to: number; originalPath: string; plugin: ITitleExtractorPlugin }[] = [];
                
                // 仅查找位置和必要数据，不修改原有小部件
                decorations.between(0, tr.state.doc.length, (from, to, deco) => {
                    if (deco.spec.widget instanceof LinkReplaceWidget) {
                        const widget = deco.spec.widget as LinkReplaceWidget;
                        if (widget.getId() === id) {
                            decorationsToUpdate.push({
                                from,
                                to,
                                originalPath: widget.getOriginalPath(),
                                plugin: widget.getPlugin()
                            });
                        }
                    }
                    return false;
                });
                
                // 如果找到了需要更新的装饰，创建新的装饰集合
                if (decorationsToUpdate.length > 0) {
                    // 创建新的装饰集合
                    const toAdd = decorationsToUpdate.map(update => 
                        Decoration.replace({
                            widget: new LinkReplaceWidget(
                                displayName,
                                update.originalPath,
                                update.plugin
                            ),
                            inclusive: false
                        }).range(update.from, update.to)
                    );
                    
                    // 要移除的位置
                    const toRemove = decorationsToUpdate.map(update => 
                        ({ from: update.from, to: update.to })
                    );
                    
                    // 函数式更新装饰集合
                    decorations = decorations.update({
                        filter: (from, to) => !toRemove.some(range => range.from === from && range.to === to),
                        add: toAdd,
                        sort: true
                    });
                }
            }
        }
        
        return decorations;
    },
    // 添加 toJSON 方法以支持序列化(CodeMirror建议)
    toJSON(state) {
        // 将装饰集合序列化为可恢复的格式
        const result: {from: number; to: number; data: {id: string; originalPath: string; displayName: string}}[] = [];
        // 遍历所有装饰并收集必要信息
        state.between(0, Infinity, (from: number, to: number, deco: any) => {
            if (deco.spec.widget instanceof LinkReplaceWidget) {
                const widget = deco.spec.widget as LinkReplaceWidget;
                result.push({
                    from,
                    to,
                    // 只保存必要的数据，如原始路径和显示名称
                    data: {
                        id: widget.getId(),
                        originalPath: widget.getOriginalPath(),
                        displayName: widget.getDisplayName()
                    }
                });
            }
            return false; // 继续遍历
        });
        return result.length ? { decorations: result } : null;
    },
    
    // 添加相应的 fromJSON 方法
    fromJSON(json: any, state: any) {
        if (!json || !json.decorations) return Decoration.none;
        
        // 从序列化数据重建装饰集合
        try {
            const decorations = json.decorations.map((item: any) => {
                const {from, to, data} = item;
                
                // 防御性检查
                if (!data || !data.originalPath || !data.displayName) {
                    logger.warn('恢复过程中发现无效的装饰数据:', item);
                    return null;
                }
                
                return Decoration.replace({
                    widget: new LinkReplaceWidget(
                        data.displayName, 
                        data.originalPath, 
                        // 尝试从state中获取plugin实例
                        state.facet && state.facet.plugin 
                            ? state.facet.plugin
                            : (window as any).app.plugins.plugins['filename-display']
                    )
                }).range(from, to);
            }).filter(Boolean); // 过滤掉null值
            
            return Decoration.set(decorations);
        } catch (e) {
            // 如果恢复失败，返回空装饰集
            logger.error("从JSON恢复装饰集失败:", e);
            return Decoration.none;
        }
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
    private activeWidgets: Map<string, { widget: LinkReplaceWidget, from: number, to: number }> = new Map();
    private logger = new LoggerService('WidgetCleanupPlugin');
    
    constructor(private view: EditorView) {
        this.logger.debug('小部件清理插件已初始化');
    }
    
    update(update: ViewUpdate) {
        // 检查文档或视口变化
        if (update.docChanged || update.viewportChanged) {
            // 创建当前活动的小部件Map
            const currentWidgets = new Map<string, { widget: LinkReplaceWidget, from: number, to: number }>();
            
            // 从当前文档中扫描所有小部件
            const decorations = update.state.field(linkDecorationField);
            decorations.between(0, update.state.doc.length, (from, to, deco) => {
                if (deco.spec.widget instanceof LinkReplaceWidget) {
                    const widget = deco.spec.widget as LinkReplaceWidget;
                    currentWidgets.set(widget.getId(), { widget, from, to });
                }
                return false;
            });
            
            // 找出已经不再活动的小部件
            const toRemove: { from: number, to: number }[] = [];
            this.activeWidgets.forEach(({ widget, from, to }, id) => {
                if (!currentWidgets.has(id)) {
                    toRemove.push({ from, to });
                }
            });
            
            // 使用事务效果清理不再活动的小部件
            if (toRemove.length > 0) {
                // 分批处理，避免过大的事务
                const batchSize = 50;
                
                // 收集所有效果，一次性分发而不是循环中分发
                const allEffects: StateEffect<any>[] = [];
                
                for (let i = 0; i < toRemove.length; i += batchSize) {
                    const batch = toRemove.slice(i, i + batchSize);
                    allEffects.push(...batch.map(pos => cleanupWidgetsEffect.of(pos)));
                }
                
                // 使用事务一次性分发所有效果，避免嵌套更新
                if (allEffects.length > 0) {
                    // 使用安全的方式分发效果，使用setTimeout确保在当前更新周期完成后执行
                    setTimeout(() => {
                        try {
                            this.view.dispatch({ effects: allEffects });
                        } catch (e) {
                            console.error('清理小部件时出错:', e);
                        }
                    }, 0);
                }
                
                // 更新活动小部件集合
                toRemove.forEach(({ from, to }) => {
                    // 查找对应的小部件ID并从活动集合中移除
                    this.activeWidgets.forEach((value, key) => {
                        if (value.from === from && value.to === to) {
                            this.activeWidgets.delete(key);
                        }
                    });
                });
            }
            
            // 添加新的活动小部件
            currentWidgets.forEach((value, key) => {
                this.activeWidgets.set(key, value);
            });
        }
    }
    
    destroy() {
        // 清理所有活动的小部件
        if (this.activeWidgets.size > 0) {
            const effects = Array.from(this.activeWidgets.values())
                .map(({ from, to }) => cleanupWidgetsEffect.of({ from, to }));
            
            // 使用安全的方式分发效果，使用setTimeout确保在当前更新周期完成后执行
            setTimeout(() => {
                try {
                    this.view.dispatch({ effects });
                } catch (e) {
                    console.error('销毁插件时清理小部件出错:', e);
                }
            }, 0);
            
            // 清空活动小部件集合
            this.activeWidgets.clear();
        }
    }
});

/**
 * 创建链接点击事件处理扩展
 */
export function createLinkClickHandler(plugin: ITitleExtractorPlugin): Extension {
    return EditorView.domEventHandlers({
        click: (event, view) => {
            // 通过数据属性识别我们的链接元素
            const target = event.target as HTMLElement;
            if (target.classList.contains('filename-display-replaced')) {
                event.preventDefault();
                event.stopPropagation();
                
                // 获取原始路径并处理点击
                const originalPath = target.dataset.originalPath;
                if (originalPath && plugin.app) {
                    const file = plugin.app.vault.getAbstractFileByPath(originalPath) || 
                               plugin.app.metadataCache.getFirstLinkpathDest(originalPath, '');
                    if (file) {
                        plugin.app.workspace.openLinkText(
                            originalPath, 
                            '', 
                            event.ctrlKey || event.metaKey
                        );
                    }
                }
                return true;
            }
            return false;
        }
    });
}

/**
 * 创建编辑器扩展
 */
export function createEditorExtensions(plugin: ITitleExtractorPlugin): Extension {
    // 添加更多日志以跟踪扩展创建过程
    logger.debug('创建编辑器扩展，包含以下组件:', 
                ['linkDecorationField', 'viewportExtension', 'incrementalUpdateExtension', 
                 'editorSyncExtension', 'createLinkClickHandler', 'widgetCleanupExtension',
                 'batchProcessField', 'createBatchProcessorPlugin']);
    
    return [
        linkDecorationField,
        batchProcessField, // 确保batchProcessField直接在顶层注册
        viewportExtension(),
        incrementalUpdateExtension(),
        editorSyncExtension(plugin),
        createLinkClickHandler(plugin),
        widgetCleanupExtension,
        createBatchProcessorPlugin()
    ];
}

/**
 * 错误处理工具
 */
// 错误类型枚举
export enum EditorErrorType {
    STATE_RECOVERY = 'STATE_RECOVERY',
    WIDGET_UPDATE = 'WIDGET_UPDATE',
    BATCH_PROCESSING = 'BATCH_PROCESSING',
    DECORATOR_INITIALIZATION = 'DECORATOR_INITIALIZATION'
}

// 错误上下文基本接口
export interface ErrorContextBase {
    [key: string]: unknown;
}

// 状态恢复错误上下文
export interface StateRecoveryContext extends ErrorContextBase {
    view?: EditorView;
    previousState?: DecorationSet;
}

// 小部件更新错误上下文
export interface WidgetUpdateContext extends ErrorContextBase {
    view?: EditorView;
    widget?: {
        from: number;
        to: number;
        originalPath: string;
        displayName?: string;
    };
}

// 批处理错误上下文
export interface BatchProcessingContext extends ErrorContextBase {
    view?: EditorView;
    state?: {
        processedCount: number;
        links: Array<{from: number; to: number; path: string; displayName: string}>;
    };
}

// 装饰器初始化错误上下文
export interface DecoratorInitializationContext extends ErrorContextBase {
    plugin?: ITitleExtractorPlugin;
}

// 组合所有错误上下文类型
export type EditorErrorContext = 
    | StateRecoveryContext 
    | WidgetUpdateContext 
    | BatchProcessingContext 
    | DecoratorInitializationContext;

export class EditorErrorHandler {
    private static readonly logger = new LoggerService('EditorErrorHandler');
    
    // 处理错误的主方法
    public static handleError(error: Error, type: EditorErrorType, context: EditorErrorContext = {}): void {
        this.logger.error(`编辑器错误 [${type}]:`, error);
        
        switch (type) {
            case EditorErrorType.STATE_RECOVERY:
                this.handleStateRecoveryError(error, context as StateRecoveryContext);
                break;
            case EditorErrorType.WIDGET_UPDATE:
                this.handleWidgetUpdateError(error, context as WidgetUpdateContext);
                break;
            case EditorErrorType.BATCH_PROCESSING:
                this.handleBatchProcessingError(error, context as BatchProcessingContext);
                break;
            case EditorErrorType.DECORATOR_INITIALIZATION:
                this.handleDecoratorInitializationError(error, context as DecoratorInitializationContext);
                break;
            default:
                this.logger.error('未知错误类型:', type);
                break;
        }
    }
    
    // 处理状态恢复错误
    private static handleStateRecoveryError(error: Error, context: StateRecoveryContext): void {
        this.logger.error('状态恢复错误:', error);
        
        // 尝试回滚到上一个有效状态
        try {
            if (context.view && context.previousState) {
                this.logger.debug('尝试回滚到上一个有效状态');
                
                // 重置装饰字段
                context.view.dispatch({
                    effects: removeLinkDecoration.of(null)
                });
            }
        } catch (recoveryError) {
            this.logger.error('状态恢复失败:', recoveryError);
        }
    }
    
    // 处理小部件更新错误
    private static handleWidgetUpdateError(error: Error, context: WidgetUpdateContext): void {
        this.logger.error('小部件更新错误:', error);
        
        // 尝试重建损坏的小部件
        try {
            if (context.widget && context.view) {
                this.logger.debug('尝试重建损坏的小部件');
                
                // 获取小部件信息
                const { from, to, originalPath, displayName } = context.widget;
                // 保存视图引用避免闭包中的可能未定义错误
                const view = context.view;
                
                // 使用setTimeout确保在当前更新周期之外执行，避免嵌套更新
                setTimeout(() => {
                    try {
                        // 移除旧的小部件
                        view.dispatch({
                            effects: [
                                addLinkDecoration.of({
                                    from,
                                    to,
                                    widget: new LinkReplaceWidget(
                                        displayName || originalPath,
                                        originalPath,
                                        (window as any).app.plugins.plugins['filename-display']
                                    )
                                })
                            ]
                        });
                    } catch (e) {
                        this.logger.error('延迟小部件重建失败:', e);
                    }
                }, 0);
            }
        } catch (rebuildError) {
            this.logger.error('小部件重建失败:', rebuildError);
        }
    }
    
    // 处理批处理错误
    private static handleBatchProcessingError(error: Error, context: BatchProcessingContext): void {
        this.logger.error('批处理错误:', error);
        
        // 尝试保存处理进度
        try {
            const { view, state } = context;
            if (state && view) {
                this.logger.debug('尝试保存批处理进度');
                
                // 暂停批处理过程
                view.dispatch({
                    effects: [
                        processBatchEffect.of({
                            batchSize: 0,
                            startIndex: state.processedCount
                        })
                    ]
                });
                
                // 设置一个延迟重试
                setTimeout(() => {
                    try {
                        this.logger.debug('尝试重新启动批处理');
                        
                        // 重新启动批处理
                        view.dispatch({
                            effects: [
                                startBatchProcessEffect.of({
                                    links: state.links
                                })
                            ]
                        });
                    } catch (retryError) {
                        this.logger.error('批处理重试失败:', retryError);
                    }
                }, 1000);
            }
        } catch (saveError) {
            this.logger.error('保存批处理进度失败:', saveError);
        }
    }
    
    // 处理装饰器初始化错误
    private static handleDecoratorInitializationError(error: Error, context: DecoratorInitializationContext): void {
        this.logger.error('装饰器初始化错误:', error);
        
        // 尝试重置装饰器
        try {
            if (context.plugin) {
                this.logger.debug('尝试重置装饰器');
                
                // 卸载并重新加载装饰器
                if (context.plugin._linkDecorator) {
                    context.plugin._linkDecorator = null;
                }
                
                // 延迟重新初始化
                setTimeout(() => {
                    try {
                        // 这里可以放置重新初始化的代码
                        // 由于我们没有看到完整的初始化代码，这里只是占位符
                        this.logger.debug('重新初始化装饰器');
                    } catch (reinitError) {
                        this.logger.error('装饰器重新初始化失败:', reinitError);
                    }
                }, 2000);
            }
        } catch (resetError) {
            this.logger.error('重置装饰器失败:', resetError);
        }
    }
    
    // 错误边界 - 包装函数调用
    public static withErrorHandling<T>(
        fn: () => T, 
        errorType: EditorErrorType, 
        context: EditorErrorContext = {}
    ): T | undefined {
        try {
            return fn();
        } catch (error) {
            this.handleError(error as Error, errorType, context);
            return undefined;
        }
    }
    
    // 错误边界 - 包装异步函数调用
    public static async withAsyncErrorHandling<T>(
        fn: () => Promise<T>, 
        errorType: EditorErrorType, 
        context: EditorErrorContext = {}
    ): Promise<T | undefined> {
        try {
            return await fn();
        } catch (error) {
            this.handleError(error as Error, errorType, context);
            return undefined;
        }
    }
}

/**
 * 使用错误处理包装更新链接显示名称函数
 */
export function updateLinkDisplayName(
    view: EditorView,
    from: number,
    to: number,
    displayName: string
): void {
    EditorErrorHandler.withErrorHandling(
        () => {
            try {
                // 查找给定范围的小部件
                let foundWidget = false;
                view.state.field(linkDecorationField).between(from, to, (start, end, deco) => {
                    if (deco.spec.widget instanceof LinkReplaceWidget) {
                        const widget = deco.spec.widget as LinkReplaceWidget;
                        // 使用新的事务系统更新文本
                        updateWidgetText(view, widget.getId(), displayName);
                        foundWidget = true;
                    }
                    return false; // 继续搜索
                });
        
                // 如果没有找到小部件，则使用传统方式更新
                if (!foundWidget) {
                    // 回退到旧方法
                    view.dispatch({
                        effects: updateLinkText.of({ from, to, displayName })
                    });
                }
            } catch (e) {
                // 记录错误但不阻止继续执行
                logger.error('更新链接文本失败:', e);
                throw e; // 重新抛出以便错误处理器捕获
            }
        },
        EditorErrorType.WIDGET_UPDATE,
        { view, from, to, displayName }
    );
}

/**
 * 更新链接显示名称 - 使用事务系统
 */
export function updateWidgetText(view: EditorView, widgetId: string, newDisplayName: string) {
    EditorErrorHandler.withErrorHandling(
        () => {
            view.dispatch({
                effects: updateTextEffect.of({ id: widgetId, displayName: newDisplayName })
            });
        },
        EditorErrorType.WIDGET_UPDATE,
        { view, widgetId, newDisplayName }
    );
}

// 帮助函数：从装饰集合中查找指定位置的原始路径
function findOriginalPath(decorations: DecorationSet, from: number, to: number): string {
    let path = '';
    
    try {
        // 添加类型安全性
        interface DecorationWithWidget {
            spec: {
                widget?: unknown;
            };
        }
        
        // DecorationSet.between 回调必须返回 false 或 void
        decorations.between(from, to, (f, t, deco) => {
            // 类型安全的检查
            const decoWithWidget = deco as DecorationWithWidget;
            
            if (decoWithWidget.spec && 
                decoWithWidget.spec.widget instanceof LinkReplaceWidget) {
                const widget = decoWithWidget.spec.widget as LinkReplaceWidget;
                path = widget.getOriginalPath();
                // 设置了路径但继续遍历，以防有多个匹配的小部件
            }
            // 返回 false 表示继续遍历
            return false;
        });
        
        return path || 'unknown-path';
    } catch (error) {
        // 错误处理：记录错误但返回默认值
        logger.error(`查找原始路径时出错 [${from}-${to}]:`, error);
        return 'error-finding-path';
    }
}

/**
 * 批处理相关的状态效果和状态字段
 */
// 批处理状态接口
export interface BatchProcessState {
    links: Array<{from: number; to: number; path: string; displayName: string}>;
    processedCount: number;
    isProcessing: boolean;
    startTime: number;
    // 添加额外的元数据,用于更好的调试和序列化
    metadata?: {
        lastProcessTime?: number;
        batchCount?: number;
        errorCount?: number;
        totalProcessingTime?: number;
    };
}

// 批处理效果
export const startBatchProcessEffect = StateEffect.define<{
    links: Array<{from: number; to: number; path: string; displayName: string}>;
}>();

export const processBatchEffect = StateEffect.define<{
    batchSize: number;
    startIndex: number;
}>();

export const updateBatchMetadataEffect = StateEffect.define<{
    metadata: Partial<BatchProcessState['metadata']>;
}>();

export const completeBatchProcessEffect = StateEffect.define<null>();

/**
 * 批处理状态字段
 */
export const batchProcessField = StateField.define<BatchProcessState>({
    create() {
        return {
            links: [],
            processedCount: 0,
            isProcessing: false,
            startTime: 0,
            metadata: {
                lastProcessTime: 0,
                batchCount: 0,
                errorCount: 0,
                totalProcessingTime: 0
            }
        };
    },
    update(state, tr) {
        // 创建新状态的副本
        let newState = { ...state };
        
        // 处理文档变化
        if (tr.docChanged) {
            // 如果文档发生变化，重置批处理状态
            if (state.isProcessing) {
                newState = {
                    ...newState,
                    isProcessing: false,
                    links: [],
                    processedCount: 0,
                    metadata: {
                        ...(state.metadata || {}),
                        lastProcessTime: Date.now()
                    }
                };
            }
        }
        
        // 处理状态效果
        for (const effect of tr.effects) {
            if (effect.is(startBatchProcessEffect)) {
                // 开始新的批处理
                const { links } = effect.value;
                newState = {
                    links,
                    processedCount: 0,
                    isProcessing: true,
                    startTime: Date.now(),
                    metadata: {
                        ...(state.metadata || {}),
                        batchCount: 0,
                        errorCount: 0,
                        totalProcessingTime: 0
                    }
                };
                
                // 记录开始信息
                logger.debug(`开始批处理 ${links.length} 个链接`);
            }
            else if (effect.is(processBatchEffect)) {
                // 处理批次
                const { batchSize, startIndex } = effect.value;
                const endIndex = Math.min(startIndex + batchSize, state.links.length);
                
                // 计算处理时间
                const processingTime = Date.now() - state.startTime;
                
                newState = {
                    ...newState,
                    processedCount: endIndex,
                    isProcessing: endIndex < state.links.length,
                    metadata: {
                        ...(state.metadata || {}),
                        lastProcessTime: Date.now(),
                        batchCount: (state.metadata?.batchCount || 0) + 1,
                        totalProcessingTime: processingTime
                    }
                };
                
                // 记录进度
                const progressPercent = Math.round((endIndex / state.links.length) * 100);
                logger.debug(`批处理进度: ${progressPercent}% (${endIndex}/${state.links.length})`);
            }
            else if (effect.is(updateBatchMetadataEffect)) {
                // 更新元数据
                newState = {
                    ...newState,
                    metadata: {
                        ...(state.metadata || {}),
                        ...effect.value.metadata
                    }
                };
            }
            else if (effect.is(completeBatchProcessEffect)) {
                // 完成批处理
                const duration = Date.now() - state.startTime;
                
                newState = {
                    ...newState,
                    isProcessing: false,
                    metadata: {
                        ...(state.metadata || {}),
                        lastProcessTime: Date.now(),
                        totalProcessingTime: duration
                    }
                };
                
                logger.debug(`批处理完成，共处理 ${state.links.length} 个链接，耗时 ${duration}ms`);
            }
        }
        
        return newState;
    },
    // 优化序列化方法
    toJSON(state: BatchProcessState) {
        // 只序列化必要的信息,忽略链接数据以减少大小和只包含必要的元数据
        return {
            processedCount: state.processedCount,
            isProcessing: state.isProcessing,
            linksCount: state.links.length,
            metadata: {
                lastProcessTime: state.metadata?.lastProcessTime,
                batchCount: state.metadata?.batchCount,
                errorCount: state.metadata?.errorCount
            }
        };
    },
    // 改进反序列化方法
    fromJSON(json: any) {
        // 检查JSON数据的有效性
        if (!json || typeof json !== 'object') {
            logger.warn('批处理状态字段: 无效的JSON数据格式', json);
            return this.create(); // 返回初始状态
        }
        
        try {
            return {
                links: [], // 恢复时链接内容总是空的
                processedCount: typeof json.processedCount === 'number' ? json.processedCount : 0,
                isProcessing: json.isProcessing === true, // 确保布尔值
                startTime: Date.now(), // 总是使用当前时间
                metadata: {
                    lastProcessTime: json.metadata?.lastProcessTime || 0,
                    batchCount: json.metadata?.batchCount || 0,
                    errorCount: json.metadata?.errorCount || 0,
                    totalProcessingTime: 0 // 重置处理时间
                }
            };
        } catch (e) {
            logger.error('批处理状态字段: 从JSON恢复失败', e);
            return this.create(); // 返回初始状态
        }
    }
});

/**
 * 批处理插件
 */
export function createBatchProcessorPlugin(): Extension {
    // 由于batchProcessField已在createEditorExtensions中注册，这里只返回ViewPlugin
    return ViewPlugin.fromClass(class BatchProcessor {
        private readonly logger = new LoggerService('BatchProcessor');
        private timeoutId: ReturnType<typeof setTimeout> | null = null;
        private errorCount: number = 0;
        
        constructor(private view: EditorView) {
            this.logger.debug('批处理器初始化');
        }
        
        update(update: ViewUpdate) {
            // 检查字段是否存在,避免Field is not present错误
            if (!update.state.facet(EditorView.updateListener)) {
                this.logger.warn('批处理更新: EditorView.updateListener字段不存在');
                return;
            }
            
            try {
                const state = update.state.field(batchProcessField);
                
                // 如果有批处理任务正在进行中，并且有未处理的链接
                if (state.isProcessing && state.processedCount < state.links.length) {
                    this.processBatch(update.view);
                }
            } catch (e) {
                // 如果字段不存在,静默失败并记录日志
                this.logger.warn('批处理更新: batchProcessField字段不可用', e);
            }
        }
        
        processBatch(view: EditorView) {
            try {
                const state = view.state.field(batchProcessField);
                const batchSize = 10; // 每批处理的链接数量
                
                // 清除之前的超时任务
                if (this.timeoutId !== null) {
                    clearTimeout(this.timeoutId);
                    this.timeoutId = null;
                }
                
                // 使用setTimeout来避免长时间阻塞UI
                this.timeoutId = setTimeout(() => {
                    try {
                        const currentState = view.state.field(batchProcessField);
                        
                        // 安全检查：确保状态自上次检查以来没有变化
                        if (!currentState.isProcessing || currentState.processedCount >= currentState.links.length) {
                            return;
                        }
                        
                        // 确定要处理的批次
                        const startIndex = currentState.processedCount;
                        const endIndex = Math.min(startIndex + batchSize, currentState.links.length);
                        const batch = currentState.links.slice(startIndex, endIndex);
                        
                        if (batch.length === 0) {
                            // 没有要处理的项目，提前完成
                            const completeEffect = completeBatchProcessEffect.of(null);
                            view.dispatch({ effects: [completeEffect] });
                            return;
                        }
                        
                        // 收集所有效果，一次性分发
                        const allEffects: StateEffect<any>[] = [];
                        
                        // 处理当前批次
                        for (const item of batch) {
                            const { from, to, path, displayName } = item;
                            
                            try {
                                // 创建链接装饰效果
                                const widget = new LinkReplaceWidget(
                                    displayName,
                                    path,
                                    (window as any).app.plugins.plugins['filename-display']
                                );
                                
                                const effect = addLinkDecoration.of({
                                    from,
                                    to,
                                    widget
                                });
                                
                                // 收集效果而不是立即分发
                                allEffects.push(effect);
                            } catch (err) {
                                this.logger.error(`处理链接时出错: ${path}`, err);
                                this.errorCount++;
                                
                                // 收集更新元数据效果
                                allEffects.push(updateBatchMetadataEffect.of({
                                    metadata: {
                                        errorCount: this.errorCount
                                    }
                                }));
                            }
                        }
                        
                        // 添加进度更新效果
                        const processBatchEffect = this.getProcessBatchEffect(startIndex, batchSize);
                        allEffects.push(processBatchEffect);
                        
                        // 检查是否是最后一批
                        const isLastBatch = endIndex >= currentState.links.length;
                        if (isLastBatch) {
                            allEffects.push(completeBatchProcessEffect.of(null));
                        }
                        
                        // 一次性分发所有效果
                        view.dispatch({ effects: allEffects });
                        
                        // 如果没有完成，安排处理下一批
                        if (!isLastBatch) {
                            // 使用requestAnimationFrame与setTimeout结合,提高性能与响应性
                            requestAnimationFrame(() => {
                                this.processBatch(view);
                            });
                        }
                    } catch (error) {
                        // 处理错误并记录
                        this.logger.error('批处理过程中发生错误:', error);
                        this.errorCount++;
                        
                        // 更新元数据
                        try {
                            view.dispatch({
                                effects: [updateBatchMetadataEffect.of({
                                    metadata: {
                                        errorCount: this.errorCount
                                    }
                                })]
                            });
                        } catch (dispatchError) {
                            this.logger.error('更新错误元数据时出错:', dispatchError);
                        }
                        
                        // 延迟后重试，或者放弃当前批处理
                        if (this.errorCount < 5) {
                            // 延迟后重试
                            setTimeout(() => {
                                this.processBatch(view);
                            }, 500);
                        } else {
                            // 放弃当前批处理
                            try {
                                view.dispatch({
                                    effects: [completeBatchProcessEffect.of(null)]
                                });
                            } catch (abortError) {
                                this.logger.error('中止批处理时出错:', abortError);
                            }
                        }
                    }
                }, 0);
            } catch (e) {
                this.logger.error('启动批处理过程中出错:', e);
            }
        }
        
        getProcessBatchEffect(startIndex: number, batchSize: number) {
            return processBatchEffect.of({
                batchSize,
                startIndex
            });
        }
        
        destroy() {
            // 清理超时任务
            if (this.timeoutId !== null) {
                clearTimeout(this.timeoutId);
                this.timeoutId = null;
            }
            
            // 重置错误计数
            this.errorCount = 0;
        }
    }, {
        // 提供要观察的字段
        provide: plugin => [
            batchProcessField
        ]
    });
} 