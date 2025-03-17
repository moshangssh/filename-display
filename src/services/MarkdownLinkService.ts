import { MarkdownView, TFile } from 'obsidian';
import type { ITitleExtractorPlugin } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';
import { Logger } from '../utils/logger';
import { LinkHandler, LinkInfo, LinkProcessResult } from './LinkHandler';

// 创建服务特定的日志记录器
const logger = new Logger('MarkdownLinkService');

export class MarkdownLinkService extends LinkHandler {
    // 文件名索引缓存，用于快速查找文件
    private fileNameIndex: Map<string, TFile> = new Map();
    // 添加性能优化相关变量
    private isProcessing: boolean = false;
    private pendingUpdate: boolean = false;
    
    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: FileDisplayCache
    ) {
        super(plugin, filenameParser, fileDisplayCache, {
            enabled: true,
            processingScope: 'preview',
            respectCustomLinkText: true
        });
        this.setupMarkdownPostProcessor();
        
        // 初始化文件名索引
        this.initializeFileNameIndex();
        
        // 监听文件变化事件，更新索引
        this.plugin.registerEvent(
            this.plugin.app.vault.on('create', (file: any) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.addFileToIndex(file);
                }
            })
        );
        
        this.plugin.registerEvent(
            this.plugin.app.vault.on('rename', (file: any, oldPath: string) => {
                if (file instanceof TFile && file.extension === 'md') {
                    // 移除旧文件名
                    const oldName = oldPath.split('/').pop() || '';
                    const oldBasename = oldName.replace('.md', '');
                    this.fileNameIndex.delete(oldBasename);
                    this.fileNameIndex.delete(oldBasename + '.md');
                    
                    // 添加新文件名
                    this.addFileToIndex(file);
                }
            })
        );
        
        this.plugin.registerEvent(
            this.plugin.app.vault.on('delete', (file: any) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.fileNameIndex.delete(file.basename);
                    this.fileNameIndex.delete(file.basename + '.md');
                }
            })
        );
    }
    
    // 初始化文件名索引缓存
    private initializeFileNameIndex(): void {
        logger.log('初始化文件名索引缓存');
        this.fileNameIndex.clear();
        
        // 获取所有Markdown文件并添加到索引中
        const allFiles = this.plugin.app.vault.getMarkdownFiles();
        allFiles.forEach((file: TFile) => {
            this.addFileToIndex(file);
        });
        
        logger.log(`已为 ${this.fileNameIndex.size / 2} 个文件建立索引`);
    }
    
    // 将文件添加到索引中
    private addFileToIndex(file: TFile): void {
        this.fileNameIndex.set(file.basename, file);
        this.fileNameIndex.set(file.basename + '.md', file);
    }

    // 设置Markdown后处理器以更新内部链接显示
    private setupMarkdownPostProcessor(): void {
        logger.log('设置 Markdown 后处理器');
        this.plugin.registerMarkdownPostProcessor((element: any, context: any) => {
            // 仅在初始加载或后续变更时处理
            this.scheduleUpdate();
        });
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
    
    // 实现抽象方法：收集需要处理的链接
    protected collectLinks(): LinkInfo[] {
        const links: LinkInfo[] = [];
        
        // 获取所有打开的Markdown视图
        const markdownViews = this.plugin.app.workspace.getLeavesOfType('markdown');
        if (markdownViews.length === 0) {
            logger.log('没有打开的Markdown视图');
            return links;
        }
        
        logger.log(`找到 ${markdownViews.length} 个打开的Markdown视图`);
        
        // 追踪已处理的链接元素，避免重复处理
        const processedElements = new Set<HTMLElement>();
        
        // 处理所有视图中的链接
        for (const leaf of markdownViews) {
            const view = leaf.view;
            if (!view || !view.containerEl) continue;
            
            // 获取视图的内容元素
            const contentEl = view.containerEl.querySelector('.markdown-reading-view');
            if (!contentEl) continue;
            
            // 查找所有内部链接元素
            const linkElements = contentEl.querySelectorAll('a.internal-link');
            logger.log(`在视图中找到 ${linkElements.length} 个内部链接`);
            
            for (let i = 0; i < linkElements.length; i++) {
                const linkEl = linkElements[i] as HTMLElement;
                
                // 跳过已处理过的元素
                if (processedElements.has(linkEl)) continue;
                
                // 如果链接已经标记为处理完成，检查其显示是否正确
                if (linkEl.dataset.handlerAdded === 'true') {
                    // 检查链接是否需要重新处理
                    const href = linkEl.getAttribute('href');
                    const originalPath = linkEl.dataset.originalPath;
                    
                    // 如果路径信息一致且不是重复文本，则跳过
                    if (href && originalPath && href === originalPath && 
                        !this.isRepeatedText(linkEl.textContent)) {
                        processedElements.add(linkEl);
                        continue;
                    }
                }
                
                // 获取链接指向的文件路径
                const href = linkEl.getAttribute('href');
                if (!href) continue;
                
                // 获取原始链接文本
                const originalLinkText = linkEl.textContent;
                if (!originalLinkText) continue;
                
                // 从 href 中提取文件路径
                const filePath = this.getFilePathFromHref(href);
                if (!filePath) {
                    logger.log(`无法从 ${href} 提取有效文件路径`);
                    continue;
                }
                
                // 查找对应的文件
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (!(file instanceof TFile)) {
                    continue;
                }
                
                links.push({
                    text: originalLinkText,
                    path: filePath,
                    file: file,
                    element: linkEl
                });
                
                // 将此元素标记为已处理
                processedElements.add(linkEl);
            }
        }
        
        return links;
    }
    
    // 检查文本是否看起来是重复的（如AAAABBBBAAAABBBB）
    // 实现抽象方法：应用显示名称到链接
    protected applyDisplayName(linkProcessResult: LinkProcessResult): void {
        const { originalInfo, displayName } = linkProcessResult;
        
        if (!originalInfo.element || !displayName) {
            return;
        }
        
        // 检查元素是否已经有相同的显示名称，避免重复应用
        if (originalInfo.element.textContent === displayName) {
            return;
        }
        
        // 检查元素是否有已添加事件标记，避免重复添加事件监听器
        const hasHandler = originalInfo.element.dataset.handlerAdded === 'true';
        
        // 更新链接文本
        logger.log(`更新链接文本: ${originalInfo.text} -> ${displayName}`);
        originalInfo.element.textContent = displayName;
        
        // 确保链接保持可点击
        originalInfo.element.style.cursor = 'pointer';
        
        // 存储原始路径信息
        originalInfo.element.dataset.originalPath = originalInfo.path;
        
        // 只有在没有添加过事件处理器时才添加
        if (!hasHandler) {
            // 确保点击事件有效
            originalInfo.element.addEventListener('click', (event) => {
                const workspace = this.plugin.app.workspace;
                const linkPath = originalInfo.element?.dataset.originalPath || originalInfo.path;
                // 使用Obsidian API打开链接
                workspace.openLinkText(linkPath, '', event.ctrlKey || event.metaKey);
            });
            
            // 标记已添加事件处理器
            originalInfo.element.dataset.handlerAdded = 'true';
        }
    }

    // 辅助方法：从 href 属性中提取文件路径
    private getFilePathFromHref(href: string): string | undefined {
        try {
            // 移除 # 后的部分（文档内部锚点）
            const parts = href.split('#');
            const pathPart = parts[0];
            
            // 解码 URI 组件
            let path = decodeURIComponent(pathPart);
            
            // 如果路径为空，返回undefined
            if (!path) return undefined;
            
            // 处理相对路径
            if (path.startsWith('./')) {
                path = path.substring(2);
            }
            
            // 尝试不同的路径形式来找到文件
            
            // 1. 原始路径
            let file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (file) return path;
            
            // 2. 如果路径不以 .md 结尾，添加它
            if (!path.endsWith('.md')) {
                const pathWithExt = path + '.md';
                file = this.plugin.app.vault.getAbstractFileByPath(pathWithExt);
                if (file) return pathWithExt;
            }
            
            // 3. 如果路径以 .md 结尾，尝试去掉它
            if (path.endsWith('.md')) {
                const pathWithoutExt = path.substring(0, path.length - 3);
                file = this.plugin.app.vault.getAbstractFileByPath(pathWithoutExt);
                if (file) return pathWithoutExt;
            }
            
            // 4. 尝试在各个目录下查找该文件（针对不含路径的纯文件名）
            const fileName = path.split('/').pop() || path;
            
            // 使用索引快速查找文件
            const foundFile = this.fileNameIndex.get(fileName);
            if (foundFile) {
                return foundFile.path;
            }
            
            // 如果在索引中找不到完全匹配的，则检查文件名部分匹配的情况
            const allFiles = this.plugin.app.vault.getMarkdownFiles();
            
            // 检查文件名部分匹配的情况
            for (const aFile of allFiles) {
                if (aFile.basename.includes(fileName) || fileName.includes(aFile.basename)) {
                    return aFile.path;
                }
            }
            
            // 如果以上都没找到，则返回原始路径，让调用方自行判断
            logger.log(`无法在库中找到匹配文件: ${path}，可能是别名或不存在的链接`);
            return path;
        } catch (error) {
            logger.error("解析href路径时出错:", error);
            return undefined;
        }
    }

    // 更新指定文件在所有打开的Markdown视图中的内部链接
    public updateMarkdownLinksForFile(targetFile: TFile): void {
        // 使用优化后的调度函数更新链接
        this.scheduleUpdate();
    }
    
    // 重写链接处理方法，添加快速返回的逻辑
    public override processLinks(): void {
        if (!this.config.enabled) {
            return;
        }
        
        try {
            // 先检查并修复可能存在的重复文本问题
            this.checkAndFixRepeatedNames();
            
            // 使用父类方法处理链接
            super.processLinks();
        } catch (e) {
            logger.error("处理阅读视图链接时发生错误:", e);
        }
    }
    
    // 检查并修复可能存在的重复文本问题
    protected checkAndFixRepeatedNames(): void {
        // 获取所有打开的Markdown视图
        const markdownViews = this.plugin.app.workspace.getLeavesOfType('markdown');
        if (markdownViews.length === 0) return;
        
        for (const leaf of markdownViews) {
            const view = leaf.view;
            if (!view || !view.containerEl) continue;
            
            // 获取视图的内容元素
            const contentEl = view.containerEl.querySelector('.markdown-reading-view');
            if (!contentEl) continue;
            
            // 查找所有内部链接元素
            const linkElements = contentEl.querySelectorAll('a.internal-link');
            
            // 使用基类的共享方法处理重复名称
            super.checkAndFixRepeatedNames(linkElements);
        }
    }
} 