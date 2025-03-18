import { Extension } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, ViewPlugin, ViewUpdate, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import type { ITitleExtractorPlugin } from '../types';
import { Logger } from '../utils/logger';
import { viewportExtension } from './viewport';
import { incrementalUpdateExtension } from './incremental-update';
import { editorSyncExtension } from './editor-sync';
import { MarkdownView } from 'obsidian';

// 创建服务特定的日志记录器
const logger = new Logger('EditorExtensions');

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
    
    constructor(
        private readonly displayName: string, 
        private readonly originalPath: string, 
        plugin: ITitleExtractorPlugin
    ) {
        super();
        this.plugin = plugin;
        // 生成唯一ID，使用路径和位置组合
        this.id = `link-widget-${originalPath}-${Date.now()}`;
        // 构造函数中不创建DOM或添加事件监听器，这些操作推迟到toDOM中
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
        span.dataset.widgetId = this.id; // 添加小部件ID到数据属性
        span.style.cursor = 'pointer';
        
        // 平滑过渡效果
        span.style.transition = 'opacity 0.15s ease-in';
        
        return span;
    }

    destroy(dom: HTMLElement | null): void {
        // 标记为已销毁
        this.isDestroyed = true;
    }

    ignoreEvent() {
        return false;
    }
    
    // 使用纯函数式方式更新文本 - 通过状态效果
    updateText(newDisplayName: string): void {
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
            // 使用 any 类型来访问 cm 属性
            const editorView = (view.editor as any).cm;
            if (editorView instanceof EditorView) {
                editorView.dispatch({ effects: [effect] });
            }
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
                
                // 创建一个数组来存储需要更新的装饰
                const updatedDecorations: { from: number; to: number; widget: LinkReplaceWidget }[] = [];
                
                // 遍历查找匹配ID的小部件
                decorations.between(0, tr.state.doc.length, (from, to, deco) => {
                    if (deco.spec.widget instanceof LinkReplaceWidget) {
                        const widget = deco.spec.widget as LinkReplaceWidget;
                        if (widget.getId() === id) {
                            // 添加更新后的装饰到数组
                            updatedDecorations.push({
                                from,
                                to,
                                widget: new LinkReplaceWidget(
                                    displayName,
                                    widget.getOriginalPath(),
                                    widget.getPlugin()
                                )
                            });
                        }
                    }
                    return false;
                });
                
                // 如果找到了需要更新的装饰，应用更新
                if (updatedDecorations.length > 0) {
                    // 一次性更新所有装饰
                    const toAdd = updatedDecorations.map(update => 
                        Decoration.replace({
                            widget: update.widget,
                            inclusive: false
                        }).range(update.from, update.to)
                    );
                    
                    const toRemove = updatedDecorations.map(update => 
                        ({ from: update.from, to: update.to })
                    );
                    
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
    return [
        linkDecorationField,
        viewportExtension(),
        incrementalUpdateExtension(),
        editorSyncExtension(plugin),
        createLinkClickHandler(plugin)
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

// 错误处理工具类
export class EditorErrorHandler {
    private static readonly logger = new Logger('EditorErrorHandler');
    
    // 处理错误的主方法
    public static handleError(error: Error, type: EditorErrorType, context: any = {}): void {
        this.logger.error(`编辑器错误 [${type}]:`, error);
        
        switch (type) {
            case EditorErrorType.STATE_RECOVERY:
                this.handleStateRecoveryError(error, context);
                break;
            case EditorErrorType.WIDGET_UPDATE:
                this.handleWidgetUpdateError(error, context);
                break;
            case EditorErrorType.BATCH_PROCESSING:
                this.handleBatchProcessingError(error, context);
                break;
            case EditorErrorType.DECORATOR_INITIALIZATION:
                this.handleDecoratorInitializationError(error, context);
                break;
            default:
                this.logger.error('未知错误类型:', type);
                break;
        }
    }
    
    // 处理状态恢复错误
    private static handleStateRecoveryError(error: Error, context: any): void {
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
    private static handleWidgetUpdateError(error: Error, context: any): void {
        this.logger.error('小部件更新错误:', error);
        
        // 尝试重建损坏的小部件
        try {
            if (context.widget && context.view) {
                this.logger.debug('尝试重建损坏的小部件');
                
                // 获取小部件信息
                const { from, to, originalPath, displayName } = context.widget;
                
                // 移除旧的小部件
                context.view.dispatch({
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
            }
        } catch (rebuildError) {
            this.logger.error('小部件重建失败:', rebuildError);
        }
    }
    
    // 处理批处理错误
    private static handleBatchProcessingError(error: Error, context: any): void {
        this.logger.error('批处理错误:', error);
        
        // 尝试保存处理进度
        try {
            if (context.state && context.view) {
                this.logger.debug('尝试保存批处理进度');
                
                // 暂停批处理过程
                context.view.dispatch({
                    effects: [
                        processBatchEffect.of({
                            batchSize: 0,
                            startIndex: context.state.processedCount
                        })
                    ]
                });
                
                // 设置一个延迟重试
                setTimeout(() => {
                    try {
                        this.logger.debug('尝试重新启动批处理');
                        
                        // 重新启动批处理
                        context.view.dispatch({
                            effects: [
                                startBatchProcessEffect.of({
                                    links: context.state.links
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
    private static handleDecoratorInitializationError(error: Error, context: any): void {
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
        context: any = {}
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
        context: any = {}
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
    decorations.between(from, to, (f, t, deco) => {
        if (deco.spec.widget instanceof LinkReplaceWidget) {
            path = (deco.spec.widget as LinkReplaceWidget).getOriginalPath();
            return false; // 继续遍历直到处理完整个范围
        }
        return false;
    });
    return path || 'unknown-path';
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
}

// 批处理效果
export const startBatchProcessEffect = StateEffect.define<{
    links: Array<{from: number; to: number; path: string; displayName: string}>;
}>();

export const processBatchEffect = StateEffect.define<{
    batchSize: number;
    startIndex: number;
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
            startTime: 0
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
                    processedCount: 0
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
                    startTime: Date.now()
                };
                
                // 记录开始信息
                logger.debug(`开始批处理 ${links.length} 个链接`);
            }
            else if (effect.is(processBatchEffect)) {
                // 处理批次
                const { batchSize, startIndex } = effect.value;
                const endIndex = Math.min(startIndex + batchSize, state.links.length);
                
                newState = {
                    ...newState,
                    processedCount: endIndex,
                    isProcessing: endIndex < state.links.length
                };
                
                // 记录进度
                const progressPercent = Math.round((endIndex / state.links.length) * 100);
                logger.debug(`批处理进度: ${progressPercent}% (${endIndex}/${state.links.length})`);
            }
            else if (effect.is(completeBatchProcessEffect)) {
                // 完成批处理
                const duration = Date.now() - state.startTime;
                logger.debug(`批处理完成，共处理 ${state.links.length} 个链接，耗时 ${duration}ms`);
                
                newState = {
                    ...newState,
                    isProcessing: false
                };
            }
        }
        
        return newState;
    },
    // 添加序列化方法
    toJSON(state: BatchProcessState) {
        // 仅保存当前进度和是否正在处理的标志，链接数据不需要保存
        return {
            processedCount: state.processedCount,
            isProcessing: state.isProcessing,
            linksCount: state.links.length
        };
    },
    // 添加反序列化方法
    fromJSON(json: any) {
        return {
            links: [],
            processedCount: json?.processedCount || 0,
            isProcessing: json?.isProcessing || false,
            startTime: Date.now()
        };
    }
});

/**
 * 批处理插件
 */
export function createBatchProcessorPlugin(): Extension {
    return ViewPlugin.fromClass(class BatchProcessor {
        private readonly logger = new Logger('BatchProcessor');
        private timeoutId: ReturnType<typeof setTimeout> | null = null;
        
        constructor(private view: EditorView) {
            this.logger.debug('批处理器初始化');
        }
        
        update(update: ViewUpdate) {
            const state = update.state.field(batchProcessField);
            
            // 如果有批处理任务正在进行中，并且有未处理的链接
            if (state.isProcessing && state.processedCount < state.links.length) {
                this.processBatch(update.view);
            }
        }
        
        processBatch(view: EditorView) {
            const state = view.state.field(batchProcessField);
            const batchSize = 10; // 每批处理的链接数量
            
            // 清除之前的超时任务
            if (this.timeoutId !== null) {
                clearTimeout(this.timeoutId);
                this.timeoutId = null;
            }
            
            // 使用setTimeout来避免长时间阻塞UI
            this.timeoutId = setTimeout(() => {
                const currentState = view.state.field(batchProcessField);
                
                // 安全检查：确保状态自上次检查以来没有变化
                if (!currentState.isProcessing || currentState.processedCount >= currentState.links.length) {
                    return;
                }
                
                // 获取当前批次的链接
                const startIndex = currentState.processedCount;
                const endIndex = Math.min(startIndex + batchSize, currentState.links.length);
                const batch = currentState.links.slice(startIndex, endIndex);
                
                // 创建装饰
                const decorations = batch.map(link => {
                    return {
                        from: link.from,
                        to: link.to,
                        widget: new LinkReplaceWidget(
                            link.displayName, 
                            link.path, 
                            (window as any).app.plugins.plugins['filename-display']
                        )
                    };
                });
                
                // 分发添加装饰效果
                const addEffects = decorations.map(deco => 
                    addLinkDecoration.of({
                        from: deco.from,
                        to: deco.to,
                        widget: deco.widget
                    })
                );
                
                // 分发批处理进度效果
                const progressEffect = processBatchEffect.of({
                    batchSize,
                    startIndex
                });
                
                // 判断是否为最后一批
                const isLastBatch = endIndex >= currentState.links.length;
                const completeEffect = isLastBatch ? completeBatchProcessEffect.of(null) : null;
                
                // 组合所有效果
                const allEffects = [
                    ...addEffects,
                    progressEffect,
                    ...(completeEffect ? [completeEffect] : [])
                ];
                
                // 分发事务
                view.dispatch({ effects: allEffects });
                
            }, 0); // 使用0延迟让浏览器决定何时执行
        }
        
        destroy() {
            // 清理超时任务
            if (this.timeoutId !== null) {
                clearTimeout(this.timeoutId);
                this.timeoutId = null;
            }
        }
    }, {
        // 提供要观察的字段
        provide: plugin => [
            batchProcessField
        ]
    });
} 