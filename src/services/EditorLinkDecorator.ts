import { Editor, MarkdownView, TFile, editorViewField } from 'obsidian';
import { EditorView, Decoration, WidgetType, ViewPlugin, ViewUpdate, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSet, Extension } from '@codemirror/state';
import type { IFilenameDisplayPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';

// 创建链接文本替换小部件
class LinkReplaceWidget extends WidgetType {
    private readonly plugin: IFilenameDisplayPlugin;
    
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
        
        // 添加点击事件监听
        span.addEventListener('click', (event) => {
            event.preventDefault();
            // 使用Obsidian API打开链接
            const workspace = this.plugin.app.workspace;
            const path = this.originalPath;
            const file = this.plugin.app.vault.getAbstractFileByPath(path) || 
                        this.plugin.app.metadataCache.getFirstLinkpathDest(path, '');
            if (file) {
                workspace.openLinkText(this.originalPath, '', event.ctrlKey || event.metaKey);
            }
        });
        
        return span;
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

export class EditorLinkDecorator {
    private plugin: IFilenameDisplayPlugin;
    private filenameParser: FilenameParser;
    private fileDisplayCache: FileDisplayCache;
    private decorationExtension: Extension;
    private activeEditorView: EditorView | null = null;

    constructor(plugin: IFilenameDisplayPlugin, filenameParser: FilenameParser, fileDisplayCache: FileDisplayCache) {
        this.plugin = plugin;
        this.filenameParser = filenameParser;
        this.fileDisplayCache = fileDisplayCache;
        
        // 创建插件实例
        this.decorationExtension = linkDecorationField;
        
        // 注册编辑器扩展
        this.plugin.registerEditorExtension([this.decorationExtension]);
        
        // 监听编辑器变更事件
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('editor-change', (editor: Editor) => {
                const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    this.updateEditorLinkDecorations(editor, view);
                }
            })
        );
        
        // 监听活跃视图变更
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', () => {
                const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                const editor = view?.editor;
                if (view && editor) {
                    this.updateEditorLinkDecorations(editor, view);
                }
            })
        );
        
        // 监听文件修改事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('modify', (file) => {
                if (file instanceof TFile) {
                    this.onFileModify(file);
                }
            })
        );
        
        // 监听元数据变更
        this.plugin.registerEvent(
            this.plugin.app.metadataCache.on('changed', (file) => {
                if (file instanceof TFile) {
                    this.onFileModify(file);
                }
            })
        );
    }

    // 文件修改处理
    private onFileModify(file: TFile): void {
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = view?.editor;
        
        // 如果修改的是当前正在编辑的文件，重新应用装饰
        if (view && editor && view.file && view.file.path === file.path) {
            this.updateEditorLinkDecorations(editor, view);
        }
    }

    public updateEditorLinkDecorations(editor: Editor, view: MarkdownView): void {
        // 检查设置，如果未启用编辑器链接装饰功能，则直接返回
        if (!this.plugin.settings.enableEditorLinkDecorations) {
            // 如果之前有装饰，清除它们
            if (this.activeEditorView) {
                this.clearDecorations();
            }
            return;
        }
        
        // 获取 CodeMirror 编辑器视图
        // @ts-ignore - 访问私有 API
        const editorView = view.editor.cm;
        if (!editorView) return;
        
        this.activeEditorView = editorView;
        
        // 先清除所有现有的装饰
        editorView.dispatch({
            effects: removeLinkDecoration.of(null)
        });
        
        // 获取编辑器中的内部链接
        const content = editor.getValue();
        const linkRegex = /\[\[(.*?)(?:\|(.*?))?\]\]/g;
        let match;

        const effects: StateEffect<any>[] = [];

        // 遍历匹配到的所有链接
        while ((match = linkRegex.exec(content)) !== null) {
            const fullMatch = match[0]; // 完整匹配 [[file]]
            const linkPath = match[1]; // 链接路径
            const hasCustomText = !!match[2]; // 是否有自定义文本

            // 如果有自定义文本，跳过处理
            if (hasCustomText) continue;

            // 获取文件
            const file = this.getFileFromLink(linkPath);
            if (!file) continue;

            // 处理文件名获取显示名称
            const processResult = this.processFile(file);
            if (!processResult.success || processResult.displayName === file.basename) continue;

            // 创建装饰效果
            const from = match.index + 2; // "[[" 后的位置
            const to = from + linkPath.length; // 链接文本结束位置
            effects.push(addLinkDecoration.of({ 
                from, 
                to, 
                widget: new LinkReplaceWidget(processResult.displayName, linkPath, this.plugin)
            }));
        }

        // 应用所有装饰效果
        if (effects.length > 0) {
            editorView.dispatch({ effects });
        }
    }

    // 清理所有装饰
    public clearDecorations(): void {
        if (this.activeEditorView) {
            this.activeEditorView.dispatch({
                effects: removeLinkDecoration.of(null)
            });
        }
    }

    // 从链接路径获取文件
    private getFileFromLink(linkPath: string): TFile | null {
        // 移除子部分引用 (#)
        const basePath = linkPath.split('#')[0];
        return this.plugin.app.metadataCache.getFirstLinkpathDest(basePath, '');
    }

    // 处理文件获取显示名称
    private processFile(file: TFile): FileDisplayResult {
        // 使用文件路径获取显示名称
        const path = file.path;
        const basename = file.basename;
        
        // 检查缓存中是否有显示名称
        if (this.fileDisplayCache.hasDisplayName(path)) {
            const displayName = this.fileDisplayCache.getDisplayName(path);
            if (displayName) {
                return {
                    success: true,
                    displayName,
                    fromCache: true
                };
            }
        }
        
        // 使用文件名解析器处理
        const result = this.filenameParser.getDisplayNameFromMetadata(file);
        if (result.success && result.displayName !== basename) {
            // 缓存结果
            this.fileDisplayCache.setDisplayName(path, result.displayName);
            return result;
        }
        
        return {
            success: false,
            displayName: basename
        };
    }
} 