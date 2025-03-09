import { Editor, MarkdownView, TFile, editorViewField } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import type { IFilenameDisplayPlugin } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';
import { LinkHandler, LinkInfo, LinkProcessResult } from './LinkHandler';
import { Logger } from '../utils/logger';
import { 
    createLinkDecorationExtension, 
    LinkReplaceWidget, 
    addLinkDecoration, 
    removeLinkDecoration 
} from '../extensions/editor';

// 创建服务特定的日志记录器
const logger = new Logger('EditorLinkDecorator');

export class EditorLinkDecorator extends LinkHandler {
    private activeEditorView: EditorView | null = null;
    private isProcessing: boolean = false;
    private pendingUpdate: boolean = false;
    private currentFile: TFile | null = null;
    // 添加一个Map来跟踪已处理的链接，包含path属性
    private processedLinks: Map<string, {from: number, to: number, displayName: string, path: string}> = new Map();
    
    constructor(plugin: IFilenameDisplayPlugin, filenameParser: FilenameParser, fileDisplayCache: FileDisplayCache) {
        super(plugin, filenameParser, fileDisplayCache, {
            enabled: plugin.settings.enableEditorLinkDecorations,
            processingScope: 'editor',
            respectCustomLinkText: true
        });
        
        // 注册编辑器扩展 - 使用新的扩展模块
        this.plugin.registerEditorExtension([
            createLinkDecorationExtension(plugin, (view) => this.onEditorChange(view))
        ]);
        
        // 保存装饰器引用，供扩展使用
        plugin._linkDecorator = this;
        
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

    // 编辑器变更处理，由扩展触发
    public onEditorChange(view: EditorView): void {
        if (view === this.activeEditorView) {
            this.scheduleUpdate();
        }
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
            // 通过非类型安全的方式访问内部 CM 实例
            // 注：Obsidian 的 API 并未完全暴露 CM 实例，所以我们需要使用这种方式
            const editorView = (editor as any).cm;
            if (editorView instanceof EditorView) {
                this.activeEditorView = editorView;
                return;
            }
            
            // 备用方法：尝试从视图获取
            if ((view as any).editMode?.editor?.cm instanceof EditorView) {
                this.activeEditorView = (view as any).editMode.editor.cm;
                return;
            }
            
            // 第三种方法：尝试获取通过其他字段
            if ((view as any).editor?.cm instanceof EditorView) {
                this.activeEditorView = (view as any).editor.cm;
                return;
            }
            
            // 如果所有方法都失败，记录错误
            logger.log("无法获取 EditorView：当前视图或编辑器的结构与预期不符");
            this.activeEditorView = null;
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
            let linkPath = match[1];
            let linkText = match[2] || linkPath; // 如果没有自定义文本，使用路径

            // 处理子部分链接（如 [[文件名#标题]]）
            if (linkPath.includes('#')) {
                const parts = linkPath.split('#');
                linkPath = parts[0]; // 仅保留文件部分
                
                // 如果没有自定义文本，链接文本应该是不带#部分的
                if (!match[2]) {
                    linkText = linkPath;
                }
            }

            // 查找链接对应的文件
            const file = this.getFileFromLink(linkPath);

            // 添加到链接列表
            links.push({
                text: linkText,
                path: linkPath,
                file: file,
                from: match.index + 2, // 跳过 '[['
                to: match.index + match[0].length - 2 // 去掉结束的 ']]'
            });
        }
        
        return links;
    }

    // 实现抽象方法：应用显示名称
    protected applyDisplayName(linkProcessResult: LinkProcessResult): void {
        if (!this.activeEditorView || !linkProcessResult.originalInfo.from || !linkProcessResult.originalInfo.to || !linkProcessResult.displayName) {
            return;
        }
        
        const { from, to, path } = linkProcessResult.originalInfo;
        const displayName = linkProcessResult.displayName;
        
        try {
            // 创建小部件并通过状态效果添加到编辑器
            const widget = new LinkReplaceWidget(
                displayName,
                path,
                this.plugin
            );
            
            // 将链接信息记录到处理过的链接中，方便后续更新
            this.processedLinks.set(`${from}-${to}`, {
                from,
                to,
                displayName,
                path
            });
            
            // 使用状态效果应用装饰
            this.activeEditorView.dispatch({
                effects: addLinkDecoration.of({ from, to, widget })
            });
        } catch (e) {
            logger.error(`无法为链接 "${path}" 应用显示名称:`, e);
        }
    }

    // 清除所有装饰
    public clearDecorations(): void {
        if (this.activeEditorView) {
            try {
                this.activeEditorView.dispatch({
                    effects: removeLinkDecoration.of(null)
                });
                this.processedLinks.clear();
            } catch (e) {
                logger.error("清除链接装饰时出错:", e);
            }
        }
    }

    // 重写链接处理方法，添加清理和重建逻辑
    public override processLinks(): void {
        if (!this.activeEditorView || !this.config.enabled) {
            return;
        }
        
        try {
            // 清除现有装饰
            this.clearDecorations();
            
            // 使用父类方法处理链接
            super.processLinks();
        } catch (e) {
            logger.error("处理编辑器链接时发生错误:", e);
        }
    }

    // 资源清理
    public dispose(): void {
        this.clearDecorations();
        this.activeEditorView = null;
        this.currentFile = null;
        this.plugin._linkDecorator = null;
    }
} 