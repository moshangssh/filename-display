import { Editor, MarkdownView, TFile, editorViewField } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';
import { LinkHandler, LinkInfo, LinkProcessResult } from './LinkHandler';
import { Logger } from '../utils/logger';
import { 
    createLinkDecorationExtension, 
    LinkReplaceWidget, 
    addLinkDecoration, 
    removeLinkDecoration,
    updateLinkDisplayName
} from '../extensions/editor';
import { ExtensionCacheService, ExtensionType } from './ExtensionCacheService';
import { ServiceContainer, SERVICE_TYPES } from './di/ServiceContainer';

// 创建服务特定的日志记录器
const logger = new Logger('EditorLinkDecorator');

export class EditorLinkDecorator extends LinkHandler {
    private activeEditorView: EditorView | null = null;
    private isProcessing: boolean = false;
    private pendingUpdate: boolean = false;
    private currentFile: TFile | null = null;
    // 添加一个Map来跟踪已处理的链接，包含path属性
    private processedLinks: Map<string, {from: number, to: number, displayName: string, path: string}> = new Map();
    // 新增：用于跟踪当前编辑器中的所有链接
    private allCurrentLinks: LinkInfo[] = [];
    // 新增：预处理时间戳
    private lastPreprocessTime: number = 0;
    // 新增：预处理间隔 (毫秒)
    private readonly PREPROCESS_INTERVAL: number = 5000; // 5秒
    // 不强制指定批处理大小的具体数值类型
    private readonly batchSize = 10;
    // 扩展缓存服务
    private extensionCacheService: ExtensionCacheService;
    
    constructor(plugin: ITitleExtractorPlugin, filenameParser: FilenameParser, fileDisplayCache: FileDisplayCache) {
        super(plugin, filenameParser, fileDisplayCache, {
            enabled: plugin.settings.enableEditorLinkDecorations,
            processingScope: 'editor',
            respectCustomLinkText: true
        });
        
        // 获取扩展缓存服务
        const serviceContainer = ServiceContainer.getInstance(plugin);
        this.extensionCacheService = serviceContainer.get<ExtensionCacheService>(SERVICE_TYPES.ExtensionCacheService);
        
        // 注册编辑器扩展 - 使用扩展缓存服务
        this.plugin.registerEditorExtension([
            this.extensionCacheService.getLinkDecorationExtension((view) => this.onEditorChange(view))
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
        
        // 新增：在插件加载时预热缓存
        this.warmUpCache();
    }

    // 新增：在插件初始化时预热缓存
    private async warmUpCache(): Promise<void> {
        await this.fileDisplayCache.warmUpCache();
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
        
        // 如果视图或文件变化，清除处理过的链接缓存
        if (this.currentFile !== view?.file) {
            this.processedLinks.clear();
            this.allCurrentLinks = []; // 清除当前链接缓存
            
            // 如果有新文件，预处理链接关系
            if (view?.file) {
                // 预加载关联文件的缓存
                this.fileDisplayCache.preloadLinkedFiles(view.file.path);
            }
        }
        
        if (view && editor) {
            this.currentFile = view.file;
            this.updateEditorView(editor, view);
            
            // 如果设置已启用并且有活跃的编辑器视图，处理链接
            if (this.plugin.settings.enableEditorLinkDecorations && this.activeEditorView) {
                // 预处理链接
                this.preprocessLinks();
                
                // 处理链接的可见部分
                this.scheduleUpdate();
            } else if (!this.plugin.settings.enableEditorLinkDecorations && this.activeEditorView) {
                // 如果已禁用但之前有装饰，清除它们
                this.clearDecorations();
            }
        } else {
            this.activeEditorView = null;
            this.currentFile = null;
            // 清除处理过的链接缓存
            this.processedLinks.clear();
            this.allCurrentLinks = []; // 清除当前链接缓存
        }
    }
    
    // 文件修改处理
    private onFileModify(file: TFile): void {
        if (this.currentFile && file.path === this.currentFile.path && this.activeEditorView) {
            // 重新收集所有链接
            this.preprocessLinks();
            this.scheduleUpdate();
        }
    }

    // 更新编辑器视图引用
    private updateEditorView(editor: Editor, view: MarkdownView): void {
        try {
            // 通过非类型安全的方式访问内部CM实例
            const editorView = (editor as any).cm;
            if (editorView instanceof EditorView) {
                this.activeEditorView = editorView;
                return;
            }
            
            // 如果无法获取EditorView，记录错误
            logger.log("无法获取EditorView：当前视图或编辑器的结构与预期不符");
            this.activeEditorView = null;
        } catch (e) {
            logger.log("获取EditorView时出现错误，可能当前不是编辑模式：", e);
            this.activeEditorView = null;
        }
    }

    // 新增：预处理所有链接，收集和缓存但不立即应用装饰
    private preprocessLinks(): void {
        // 检查最近是否已经预处理过，避免频繁处理
        const now = Date.now();
        if (now - this.lastPreprocessTime < this.PREPROCESS_INTERVAL) {
            return;
        }
        
        this.lastPreprocessTime = now;
        
        // 收集所有链接
        this.allCurrentLinks = this.collectLinks();
        
        // 如果没有链接，直接返回
        if (this.allCurrentLinks.length === 0) {
            return;
        }
        
        // 提取所有链接目标路径
        const allPaths = this.allCurrentLinks
            .map(link => link.path)
            .filter(path => !!path);
        
        // 批量获取显示名称
        const displayNamesMap = this.fileDisplayCache.batchGetDisplayNames(allPaths);
        
        // 对于没有缓存的路径，创建任务来处理这些文件
        const pathsToProcess = allPaths.filter(path => !displayNamesMap.has(path));
        
        // 异步处理这些路径，但不等待完成
        if (pathsToProcess.length > 0) {
            this.processPathsAsync(pathsToProcess);
        }
    }
    
    // 新增：异步处理路径，不阻塞UI
    private async processPathsAsync(paths: string[]): Promise<void> {
        // 转换路径到文件对象
        const files = paths
            .map(path => this.plugin.app.vault.getFileByPath(path))
            .filter(file => file !== null && file !== undefined) as TFile[];
        
        // 异步处理文件
        for (let i = 0; i < files.length; i += this.batchSize) {
            const batch = files.slice(i, i + this.batchSize);
            
            // 创建异步处理任务
            setTimeout(async () => {
                for (const file of batch) {
                    await this.processFileWithCache(file);
                }
            }, 0);
            
            // 每批处理后稍微暂停，避免阻塞UI
            if (i + this.batchSize < files.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
    }
    
    // 新增：处理单个文件并缓存结果，与LinkHandler中的processFile区分
    private async processFileWithCache(file: TFile): Promise<void> {
        try {
            if (!file || !file.path) return;
            
            // 检查缓存是否已有此文件的显示名称
            if (this.fileDisplayCache.hasDisplayName(file.path)) {
                return;
            }
            
            // 使用父类的processFile方法处理文件
            const result = this.processFile(file);
            
            // 如果成功获取了显示名称，添加到缓存
            if (result.success && result.displayName) {
                this.fileDisplayCache.setDisplayName(file.path, result.displayName);
            }
        } catch (error) {
            logger.log(`处理文件 ${file.path} 失败:`, error);
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

            // 获取匹配的范围
            const from = match.index + 2; // 跳过 '[['
            const to = match.index + match[0].length - 2; // 去掉结束的 ']]'
            
            // 检查这个链接是否已经处理过，避免重复处理
            const key = `${from}-${to}`;
            if (this.processedLinks.has(key)) {
                const existing = this.processedLinks.get(key);
                // 如果已处理且路径未变，跳过处理
                if (existing && existing.path === linkPath) {
                    continue;
                }
                // 如果路径变了，删除旧的处理记录
                this.processedLinks.delete(key);
            }

            // 查找链接对应的文件
            const file = this.getFileFromLink(linkPath);
            
            // 记录源文件和目标文件的链接关系（用于未来预加载）
            if (file && this.currentFile) {
                this.fileDisplayCache.addFileLink(this.currentFile.path, file.path);
            }

            // 添加到链接列表
            links.push({
                text: linkText,
                path: linkPath,
                file: file,
                from: from,
                to: to
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
        
        // 检查是否已经应用了相同的显示名称，避免重复应用
        const key = `${from}-${to}`;
        const existingLink = this.processedLinks.get(key);
        if (existingLink) {
            if (existingLink.displayName === displayName) {
                return; // 如果已经应用了相同的显示名称，则跳过
            }
            
            // 如果链接已存在但显示名称变了，尝试直接更新文本而不重新创建装饰
            try {
                // 应用更新
                updateLinkDisplayName(this.activeEditorView, from, to, displayName);
                
                // 更新处理记录
                this.processedLinks.set(key, {
                    from,
                    to,
                    displayName,
                    path
                });
                
                return;
            } catch (e) {
                // 如果更新失败，回退到重新创建装饰
                logger.log("更新链接文本失败，将重新创建装饰:", e);
            }
        }
        
        try {
            // 创建小部件并通过状态效果添加到编辑器
            const widget = new LinkReplaceWidget(
                displayName,
                path,
                this.plugin
            );
            
            // 将链接信息记录到处理过的链接中，方便后续更新
            this.processedLinks.set(key, {
                from,
                to,
                displayName,
                path
            });
            
            // 通过编辑器视图的状态效果来添加装饰
            this.activeEditorView.dispatch({
                effects: addLinkDecoration.of({
                    from: from,
                    to: to,
                    widget: widget
                })
            });
        } catch (e) {
            logger.log("应用链接装饰时出错:", e);
        }
    }

    // 清除所有链接装饰
    public clearDecorations(): void {
        if (!this.activeEditorView) {
            return;
        }
        
        try {
            // 通过状态效果清除所有装饰
            this.activeEditorView.dispatch({
                effects: removeLinkDecoration.of(null)
            });
            
            // 清除处理过的链接记录
            this.processedLinks.clear();
        } catch (e) {
            logger.log("清除链接装饰时出错:", e);
        }
    }

    // 重写处理链接的方法，分批处理以改善性能
    public override processLinks(): void {
        if (!this.activeEditorView || !this.currentFile || !this.config.enabled) {
            return;
        }
        
        try {
            // 使用已预处理的链接或收集新的链接
            let links = this.allCurrentLinks.length > 0
                ? this.allCurrentLinks
                : this.collectLinks();
            
            // 没有链接，直接返回
            if (links.length === 0) {
                return;
            }
            
            // 分批处理链接，避免一次性处理太多导致UI卡顿
            this.processBatchOfLinks(links, 0);
        } catch (e) {
            logger.log("处理链接时出错:", e);
        }
    }

    // 分批处理链接，每批处理BATCH_SIZE个
    private processBatchOfLinks(links: LinkInfo[], startIndex: number): void {
        // 检查是否还有链接需要处理
        if (startIndex >= links.length || !this.activeEditorView) {
            return;
        }
        
        // 计算当前批次的结束索引
        const endIndex = Math.min(startIndex + this.batchSize, links.length);
        const currentBatch = links.slice(startIndex, endIndex);
        
        // 处理当前批次
        for (const link of currentBatch) {
            // 先尝试从缓存获取显示名称
            const cachedDisplayName = this.fileDisplayCache.getDisplayName(link.path);
            
            if (cachedDisplayName) {
                // 如果缓存中有显示名称，直接使用
                this.applyDisplayName({
                    originalInfo: link,
                    displayName: cachedDisplayName,
                    shouldUpdate: true,
                    success: true
                });
            } else {
                // 否则使用标准的处理方法
                const processResult = this.processLinkInfo(link);
                if (processResult.success && processResult.shouldUpdate) {
                    this.applyDisplayName(processResult);
                }
            }
        }
        
        // 如果还有剩余链接，安排下一批处理
        if (endIndex < links.length) {
            setTimeout(() => {
                this.processBatchOfLinks(links, endIndex);
            }, 0); // 使用0延迟让UI有机会响应
        }
    }

    public dispose(): void {
        // 清除装饰
        this.clearDecorations();
        
        // 清除缓存
        this.processedLinks.clear();
        this.allCurrentLinks = [];
        
        // 重置状态
        this.activeEditorView = null;
        this.currentFile = null;
        this.isProcessing = false;
        this.pendingUpdate = false;
    }

    /**
     * 获取编辑器链接装饰扩展
     * 实现IEditorLinkDecorator接口
     */
    public getExtension(): Extension[] {
        // 返回从扩展缓存服务获取的扩展
        return [
            this.extensionCacheService.getLinkDecorationExtension((view) => this.onEditorChange(view))
        ];
    }
} 