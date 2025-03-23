import { Editor, MarkdownView, TFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { IFileDisplayCache, ILinkStateManager } from './interfaces/IServices';
import { LinkInfo, LinkProcessResult, LinkUtils } from './LinkUtils';
import { LoggerService } from "../services/LoggerService";
import { 
    LinkReplaceWidget,
    addLinkDecoration,
    removeLinkDecoration,
    updateLinkDisplayName
} from '../extensions';
import { ExtensionCacheService, ExtensionType } from './ExtensionCacheService';
import { getEditorView } from '../utils/editor-utils';
import { ServiceContainer } from '../core/ServiceContainer';
import { Logged, Cacheable, CatchError } from '../utils/decorators';

// 创建服务特定的日志记录器
const logger = new LoggerService('EditorLinkDecorator');

/**
 * 编辑器链接装饰器
 * 负责在编辑器中装饰和管理链接显示
 */
export class EditorLinkDecorator {
    private activeEditorView: EditorView | null = null;
    private isProcessing: boolean = false;
    private pendingUpdate: boolean = false;
    private currentFile: TFile | null = null;
    // 添加一个Map来跟踪已处理的链接，包含path属性
    private processedLinks: Map<string, {from: number, to: number, displayName: string, path: string}> = new Map();
    // 用于跟踪当前编辑器中的所有链接
    private allCurrentLinks: LinkInfo[] = [];
    // 预处理时间戳
    private lastPreprocessTime: number = 0;
    // 预处理间隔 (毫秒)
    private readonly PREPROCESS_INTERVAL: number = 5000; // 5秒
    // 批处理大小
    private batchSize = 10;
    // 扩展缓存服务
    private extensionCacheService: ExtensionCacheService;
    // 链接状态管理器
    private linkStateManager: ILinkStateManager;
    // 扩展集合
    private extensions: Extension[] = [];
    // 链接工具类实例
    private linkUtils: LinkUtils;
    // 是否已注册扩展
    private isExtensionRegistered: boolean = false;
    
    /**
     * 静态工厂方法，从服务容器获取依赖
     */
    public static create(plugin: ITitleExtractorPlugin): EditorLinkDecorator {
        const container = ServiceContainer.getInstance();
        
        // 从容器中获取依赖
        const filenameParser = container.get<FilenameParser>('filenameParser');
        const fileDisplayCache = container.get<IFileDisplayCache>('fileDisplayCache');
        
        // 安全获取 linkStateManager
        let linkStateManager;
        try {
            if (container.has('linkStateManager')) {
                linkStateManager = container.get<ILinkStateManager>('linkStateManager');
            } else {
                linkStateManager = plugin.linkStateManager;
            }
        } catch (error) {
            logger.error('获取 linkStateManager 服务失败', error);
            linkStateManager = plugin.linkStateManager;
        }
        
        const loggerService = container.get<LoggerService>('loggerService');
        
        // 创建服务实例
        return new EditorLinkDecorator(
            plugin, 
            filenameParser, 
            fileDisplayCache, 
            linkStateManager, 
            loggerService
        );
    }
    
    constructor(
        private plugin: ITitleExtractorPlugin, 
        private filenameParser: FilenameParser, 
        private fileDisplayCache: IFileDisplayCache,
        linkStateManager?: ILinkStateManager,
        loggerService?: LoggerService
    ) {
        // 获取或设置依赖项
        this.linkStateManager = linkStateManager || plugin.linkStateManager;
        this.extensionCacheService = plugin.extensionCacheService;
        
        // 初始化LinkUtils
        const localLoggerService = loggerService || new LoggerService();
        this.linkUtils = new LinkUtils(plugin, filenameParser, fileDisplayCache, localLoggerService, {
            enabled: plugin.settings.enableEditorLinkDecorations,
            processingScope: 'editor',
            respectCustomLinkText: true
        });
        
        // 创建扩展（但不直接注册，由Plugin主类调用getExtension获取）
        this.extensions = [
            this.extensionCacheService.getLinkDecorationExtension((view) => this.onEditorChange(view)),
            this.extensionCacheService.getLinkObserverExtension((view) => this.onEditorChange(view)),
            // 将updateListener添加到初始扩展列表中，而不是在运行时动态添加
            EditorView.updateListener.of(update => {
                if (update.docChanged || update.viewportChanged) {
                    this.queueUpdate();
                }
            })
        ];
        
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
                    this.queueUpdate();
                }
            })
        );
        
        // 在插件加载时预热缓存
        this.warmUpCache();
    }

    // 在插件初始化时预热缓存
    private async warmUpCache(): Promise<void> {
        await this.fileDisplayCache.warmUpCache();
    }

    // 添加动态批处理大小调整功能
    private adjustBatchSize() {
        const totalLinks = this.allCurrentLinks.length;
        const lastProcessTime = this.lastPreprocessTime ? (Date.now() - this.lastPreprocessTime) : 0;
        
        // 根据链接总数和处理时间动态调整批处理大小
        let newBatchSize = this.batchSize;
        
        // 如果上次处理时间太长，减小批处理大小
        if (lastProcessTime > 150) {
            newBatchSize = Math.max(5, Math.floor(this.batchSize * 0.8));
        } 
        // 如果处理时间快，适当增加批处理大小
        else if (lastProcessTime < 50 && totalLinks > this.batchSize * 2) {
            newBatchSize = Math.min(50, Math.floor(this.batchSize * 1.2));
        } 
        // 根据链接总数调整基准批处理大小
        else {
            newBatchSize = Math.max(
                5,
                Math.min(
                    50, 
                    Math.floor(totalLinks / 10)
                )
            );
        }
        
        if (newBatchSize !== this.batchSize) {
            this.batchSize = newBatchSize;
            logger.debug(`动态调整批处理大小为: ${this.batchSize}, 总链接数: ${totalLinks}, 上次处理时间: ${lastProcessTime}ms`);
        }
    }

    // 使用 requestIdleCallback 进行非紧急更新
    private scheduleProcessLinks() {
        // 如果已经在处理中，不再重复调度
        if (this.isProcessing) {
            this.pendingUpdate = true;
            return;
        }
        
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(
                () => this.processLinks(), 
                { timeout: 300 }
            );
        } else {
            // 回退到 setTimeout
            setTimeout(() => this.processLinks(), 10);
        }
    }

    // 编辑器变更处理，由扩展触发
    public onEditorChange(view: EditorView): void {
        if (view === this.activeEditorView) {
            this.queueUpdate();
        }
    }

    // 队列更新处理
    public queueUpdate(): void {
        if (this.plugin.settings.enableEditorLinkDecorations) {
            this.scheduleProcessLinks();
        }
    }

    // 更新活跃视图和当前文件引用
    @Logged('info')
    public updateActiveView(): void {
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
                this.queueUpdate();
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
            this.queueUpdate();
        }
    }

    // 更新编辑器视图
    private updateEditorView(editor: Editor, view: MarkdownView): void {
        const editorView = getEditorView(view);
        if (editorView) {
            this.activeEditorView = editorView;
            
            // 不再动态添加扩展，而是在初始化时就设置好所有扩展
            // 利用现有的扩展触发更新，避免重复注册
        }
    }

    // 预处理所有链接，收集和缓存但不立即应用装饰
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
        
        // 逐个获取显示名称，替代批量获取
        const displayNamesMap = new Map<string, string>();
        for (const path of allPaths) {
            const displayName = this.fileDisplayCache.getDisplayName(path);
            if (displayName) {
                displayNamesMap.set(path, displayName);
            }
        }
        
        // 对于没有缓存的路径，创建任务来处理这些文件
        const pathsToProcess = allPaths.filter(path => !displayNamesMap.has(path));
        
        // 异步处理这些路径，但不等待完成
        if (pathsToProcess.length > 0) {
            this.processPathsAsync(pathsToProcess);
        }
    }
    
    // 异步处理路径，不阻塞UI
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
    
    // 处理单个文件并缓存结果
    private async processFileWithCache(file: TFile): Promise<void> {
        try {
            if (!file || !file.path) return;
            
            // 检查缓存是否已有此文件的显示名称
            if (this.fileDisplayCache.hasDisplayName(file.path)) {
                return;
            }
            
            // 使用LinkUtils处理文件
            const result = this.linkUtils.processFile(file);
            
            // 如果成功获取了显示名称，添加到缓存
            if (result.success && result.displayName) {
                this.fileDisplayCache.setDisplayName(file.path, result.displayName);
            }
        } catch (error) {
            logger.log(`处理文件 ${file.path} 失败:`, error);
        }
    }

    // 收集链接
    @Logged('debug')
    public collectLinks(): LinkInfo[] {
        if (!this.activeEditorView || !this.currentFile) {
            return [];
        }
        
        const links: LinkInfo[] = [];
        
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

            // 先进行初始文件查找
            let file = this.linkUtils.getFileFromLink(linkPath);
            
            // 如果找不到文件，尝试在包含下划线的路径上进行更多处理
            if (!file && (linkPath.includes('_') || linkPath.includes(' '))) {
                // 尝试使用替代路径
                let altPath = linkPath.includes('_') ? linkPath.replace(/_/g, ' ') : linkPath.replace(/ /g, '_');
                
                // 再次尝试查找文件
                file = this.linkUtils.getFileFromLink(altPath);
                
                // 如果找到了文件，更新linkPath
                if (file) {
                    linkPath = file.path;
                }
            }
            
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

    // 应用显示名称
    private applyDisplayName(linkProcessResult: LinkProcessResult): void {
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
            
            // 如果链接已存在但显示名称变了，使用 LinkStateManager 更新
            try {
                // 使用 LinkStateManager 应用更新
                this.linkStateManager.updateLinkDisplayName(
                    this.activeEditorView,
                    from,
                    to,
                    displayName
                );
                
                // 更新处理记录
                this.processedLinks.set(key, {
                    from,
                    to,
                    displayName,
                    path
                });
                
                return;
            } catch (e) {
                // 如果更新失败，记录错误
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
            // 通过链接状态管理器清除所有装饰
            this.linkStateManager.clearDecorations(this.activeEditorView);
            
            // 清除处理过的链接记录
            this.processedLinks.clear();
        } catch (e) {
            logger.log("清除链接装饰时出错:", e);
        }
    }

    // 处理链接
    @Logged('debug')
    @CatchError({ source: 'EditorLinkDecorator' })
    public processLinks(): void {
        if (!this.activeEditorView || !this.currentFile || !this.plugin.settings.enableEditorLinkDecorations) {
            return;
        }
        
        // 防止重复处理
        if (this.isProcessing) {
            this.pendingUpdate = true;
            return;
        }
        
        this.isProcessing = true;
        this.pendingUpdate = false;
        
        try {
            // 如果还没有收集链接，先收集
            if (this.allCurrentLinks.length === 0) {
                this.allCurrentLinks = this.collectLinks();
            }
            
            // 没有链接需要处理
            if (this.allCurrentLinks.length === 0) {
                this.isProcessing = false;
                return;
            }
            
            // 动态调整批处理大小
            this.adjustBatchSize();
            
            // 开始时间
            const startTime = performance.now();
            
            // 使用批处理
            this.linkUtils.processBatch(
                this.allCurrentLinks, 
                0,
                (result) => {
                    if (result.success && result.shouldUpdate && result.displayName) {
                        this.applyDisplayName(result);
                    }
                }
            );
            
            // 记录处理时间
            this.lastPreprocessTime = performance.now() - startTime;
            
            // 处理完成后检查是否有挂起的更新
            this.isProcessing = false;
            if (this.pendingUpdate) {
                // 使用requestIdleCallback安排下一次处理，给UI线程喘息机会
                this.scheduleProcessLinks();
            }
        } catch (error) {
            this.isProcessing = false;
            logger.error("处理链接出错:", error);
            // 确保错误不会阻止未来的处理
            if (this.pendingUpdate) {
                setTimeout(() => this.queueUpdate(), 1000); // 错误后延迟重试
            }
        }
    }

    /**
     * 获取编辑器链接装饰扩展
     * 实现IEditorLinkDecorator接口
     */
    public getExtension(): Extension[] {
        // 标记扩展已注册，防止重复注册
        this.isExtensionRegistered = true;
        return this.extensions;
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        logger.debug('清理编辑器链接装饰器资源');
    }
} 