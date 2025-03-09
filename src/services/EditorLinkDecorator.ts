import { Editor, MarkdownView, TFile, editorViewField } from 'obsidian';
import { EditorView, Decoration, WidgetType, ViewPlugin, ViewUpdate, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSet, Extension } from '@codemirror/state';
import type { IFilenameDisplayPlugin } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';
import { LinkHandler, LinkInfo, LinkProcessResult } from './LinkHandler';
import { Logger } from '../utils/logger';

// 创建服务特定的日志记录器
const logger = new Logger('EditorLinkDecorator');

// 创建链接文本替换小部件
class LinkReplaceWidget extends WidgetType {
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

// 定义状态效果，用于添加和清理装饰效果
const addLinkDecoration = StateEffect.define<{ from: number; to: number; widget: LinkReplaceWidget }>();
const removeLinkDecoration = StateEffect.define<null>();

// 状态字段，用于管理所有链接装饰
const linkDecorationField = StateField.define<DecorationSet>({
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

// 创建视图插件，监听编辑器状态变化
const viewPlugin = ViewPlugin.fromClass(
    class {
        constructor(private view: EditorView) {}
        
        update(update: ViewUpdate) {
            // 仅在文档内容变化时触发更新
            if (update.docChanged) {
                // 由ViewPlugin通知状态变化，而不是直接处理
                // 稍后会被EditorLinkDecorator的updateFromDocChange方法处理
            }
        }
    }
);

export class EditorLinkDecorator extends LinkHandler {
    private decorationExtension: Extension;
    private activeEditorView: EditorView | null = null;
    private isProcessing: boolean = false;
    private pendingUpdate: boolean = false;
    private currentFile: TFile | null = null;
    
    constructor(plugin: IFilenameDisplayPlugin, filenameParser: FilenameParser, fileDisplayCache: FileDisplayCache) {
        super(plugin, filenameParser, fileDisplayCache, {
            enabled: plugin.settings.enableEditorLinkDecorations,
            processingScope: 'editor',
            respectCustomLinkText: true
        });
        
        // 创建插件实例，包含视图插件和状态字段
        this.decorationExtension = [linkDecorationField, viewPlugin];
        
        // 注册编辑器扩展
        this.plugin.registerEditorExtension([this.decorationExtension]);
        
        // 监听活跃视图变更，这是必要的Obsidian事件
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', () => {
                // 延迟执行以确保编辑器完全加载
                setTimeout(() => {
                    this.updateActiveView();
                }, 50);
            })
        );
        
        // 监听文件修改事件，但仅在文件内容变化时触发，避免和CodeMirror状态更新重复
        this.plugin.registerEvent(
            this.plugin.app.metadataCache.on('changed', (file) => {
                if (file instanceof TFile && this.currentFile && file.path === this.currentFile.path) {
                    // 使用防抖避免频繁更新
                    this.scheduleUpdate();
                }
            })
        );
    }

    // 新增：调度更新处理，避免频繁处理
    private scheduleUpdate(): void {
        if (this.isProcessing) {
            this.pendingUpdate = true;
            return;
        }
        
        this.isProcessing = true;
        
        // 使用requestAnimationFrame确保视觉更新在下一帧
        requestAnimationFrame(() => {
            this.processLinks();
            this.isProcessing = false;
            
            // 如果在处理过程中有新的更新请求，继续处理
            if (this.pendingUpdate) {
                this.pendingUpdate = false;
                this.scheduleUpdate();
            }
        });
    }

    // 更新活跃视图和当前文件引用
    private updateActiveView(): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = view?.editor;
        
        if (view && editor) {
            this.currentFile = view.file;
            this.updateEditorView(editor, view);
            
            // 如果设置已启用并且有活跃的编辑器视图，处理链接
            if (this.plugin.settings.enableEditorLinkDecorations && this.activeEditorView) {
                this.scheduleUpdate();
            } else if (!this.plugin.settings.enableEditorLinkDecorations && this.activeEditorView) {
                // 如果已禁用但之前有装饰，清除它们
                this.clearDecorations();
            }
        } else {
            this.activeEditorView = null;
            this.currentFile = null;
        }
    }
    
    // 文件修改处理
    private onFileModify(file: TFile): void {
        if (this.currentFile && file.path === this.currentFile.path && this.activeEditorView) {
            this.scheduleUpdate();
        }
    }

    // 更新编辑器视图引用
    private updateEditorView(editor: Editor, view: MarkdownView): void {
        try {
            // 方法1: 尝试直接从编辑器获取
            if ((editor as any).cm instanceof EditorView) {
                this.activeEditorView = (editor as any).cm;
            } 
            // 方法2: 尝试从视图获取
            else if ((view as any).editMode?.editor?.cm instanceof EditorView) {
                this.activeEditorView = (view as any).editMode.editor.cm;
            }
            // 方法3: 尝试从内部状态获取 
            else if ((view as any).editor?.cm instanceof EditorView) {
                this.activeEditorView = (view as any).editor.cm;
            }
            // 如果以上方法都失败，记录此情况但不抛出错误
            else {
                logger.log("无法获取 EditorView：当前视图或编辑器的结构与预期不符");
                this.activeEditorView = null;
            }
        } catch (e) {
            logger.log("获取 EditorView 时出现错误，可能当前不是编辑模式：", e);
            this.activeEditorView = null;
        }
    }

    // 实现抽象方法：收集需要处理的链接
    protected collectLinks(): LinkInfo[] {
        const links: LinkInfo[] = [];
        
        if (!this.activeEditorView) {
            return links;
        }
        
        // 获取编辑器中的内容
        const content = this.activeEditorView.state.doc.toString();
        const linkRegex = /\[\[(.*?)(?:\|(.*?))?\]\]/g;
        let match;

        // 遍历匹配到的所有链接
        while ((match = linkRegex.exec(content)) !== null) {
            const fullMatch = match[0]; // 完整匹配 [[file]]
            const linkPath = match[1]; // 链接路径
            const hasCustomText = !!match[2]; // 是否有自定义文本

            // 如果有自定义文本且配置为尊重自定义文本，跳过处理
            if (hasCustomText && this.config.respectCustomLinkText) continue;

            // 获取文件
            const file = this.getFileFromLink(linkPath);
            if (!file) continue;

            // 创建链接信息
            links.push({
                text: linkPath,
                path: linkPath,
                file: file,
                from: match.index,
                to: match.index + fullMatch.length
            });
        }

        return links;
    }

    // 实现抽象方法：应用显示名称到链接装饰
    protected applyDisplayName(linkProcessResult: LinkProcessResult): void {
        if (!this.activeEditorView || !linkProcessResult.displayName) {
            return;
        }
        
        const { from, to } = linkProcessResult.originalInfo;
        if (from === undefined || to === undefined) {
            return;
        }

        // 创建替换小部件
        const widget = new LinkReplaceWidget(
            linkProcessResult.displayName,
            linkProcessResult.originalInfo.path,
            this.plugin
        );

        // 分发状态效果，而不是直接修改DOM
        this.activeEditorView.dispatch({
            effects: addLinkDecoration.of({ from, to, widget })
        });
    }

    // 清除所有装饰
    public clearDecorations(): void {
        if (this.activeEditorView) {
            this.activeEditorView.dispatch({
                effects: removeLinkDecoration.of(null)
            });
        }
    }

    // 资源清理
    public dispose(): void {
        this.clearDecorations();
        this.activeEditorView = null;
    }
} 