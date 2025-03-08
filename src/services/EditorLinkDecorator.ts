import { Editor, MarkdownView, TFile, editorViewField } from 'obsidian';
import { EditorView, Decoration, WidgetType, ViewPlugin, ViewUpdate, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSet, Extension } from '@codemirror/state';
import type { IFilenameDisplayPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';

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
        
        // 获取编辑器视图 - 使用更健壮的方法
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
                console.debug("无法获取 EditorView：当前视图或编辑器的结构与预期不符");
                return;
            }
        } catch (e) {
            console.debug("获取 EditorView 时出现错误，可能当前不是编辑模式：", e);
            return;
        }
        
        // 没有找到 EditorView，无法继续
        if (!this.activeEditorView) return;
        
        // 先清除所有现有的装饰
        this.activeEditorView.dispatch({
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
            this.activeEditorView.dispatch({ effects });
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

    // 处置资源，清理所有装饰和引用
    public dispose(): void {
        try {
            // 清除装饰
            this.clearDecorations();
            
            // 清除编辑器视图引用
            this.activeEditorView = null;
            
            // 释放其他资源引用
            // 注意：不要清除 plugin、filenameParser 和 fileDisplayCache 引用
            // 因为它们是由外部管理的，我们不负责它们的生命周期
        } catch (e) {
            console.debug("清理装饰器资源时出现错误", e);
        }
    }
} 