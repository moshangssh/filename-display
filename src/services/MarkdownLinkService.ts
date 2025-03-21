import { MarkdownView, TFile } from 'obsidian';
import type { ITitleExtractorPlugin } from '../types';
import { FilenameParser } from './FilenameParser';
import { IFileDisplayCache, IMarkdownLinkService } from './interfaces/IServices';
import { LoggerService } from "../services/LoggerService";
import { LinkUtils, LinkInfo, LinkProcessResult, LinkHandlerConfig } from './LinkUtils';

// 创建服务特定的日志记录器
const logger = new LoggerService('MarkdownLinkService');

export class MarkdownLinkService implements IMarkdownLinkService {
    // 文件名索引缓存，用于快速查找文件
    private fileNameIndex: Map<string, TFile> = new Map();
    // 添加性能优化相关变量
    private isProcessing: boolean = false;
    private pendingUpdate: boolean = false;
    // 链接工具类
    private linkUtils: LinkUtils;
    // 插件实例
    private plugin: ITitleExtractorPlugin;
    
    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: IFileDisplayCache
    ) {
        this.plugin = plugin;
        this.linkUtils = new LinkUtils(plugin, filenameParser, fileDisplayCache, {
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
    
    // 调度更新处理，避免频繁处理
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
    
    // 收集需要处理的链接
    private collectLinks(): LinkInfo[] {
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
            if (!view?.containerEl) continue;
            
            // 获取视图的内容元素
            const contentEl = view.containerEl.querySelector('.markdown-reading-view');
            if (!contentEl) continue;
            
            // 查找所有内部链接元素
            const linkElements = Array.from(contentEl.querySelectorAll('a.internal-link')) as HTMLElement[];
            logger.log(`在视图中找到 ${linkElements.length} 个内部链接`);
            
            for (const linkEl of linkElements) {
                // 跳过已处理过的元素
                if (processedElements.has(linkEl)) continue;
                
                // 如果链接已经标记为处理完成，检查其显示是否正确
                if (linkEl.dataset?.handlerAdded === 'true') {
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
                
                // 使用LinkUtils解析文件路径
                const filePath = this.linkUtils.getFilePathFromHref(href);
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
                    element: linkEl as HTMLElement
                });
                
                // 将此元素标记为已处理
                processedElements.add(linkEl as HTMLElement);
            }
        }
        
        return links;
    }
    
    // 检查文本是否看起来是重复的（如AAAABBBBAAAABBBB）
    private isRepeatedText(text: string | null): boolean {
        if (!text) return false;
        
        // 如果文本长度大于100，可能是重复文本
        if (text.length > 100) return true;
        
        // 寻找重复模式
        if (text.length >= 4) {
            const firstHalf = text.substring(0, text.length / 2);
            const secondHalf = text.substring(text.length / 2);
            
            // 检查前后部分是否相同或相似
            if (firstHalf === secondHalf) return true;
            
            // 检查是否有多次重复的字符（如AAAAAA）
            const uniqueChars = new Set(text.split('')).size;
            if (uniqueChars <= 3 && text.length >= 6) return true;
        }
        
        return false;
    }
    
    // 应用显示名称到链接
    private applyDisplayName(linkProcessResult: LinkProcessResult): void {
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

    // 更新指定文件在所有打开的Markdown视图中的内部链接
    public updateMarkdownLinksForFile(targetFile: TFile): void {
        // 使用优化后的调度函数更新链接
        this.scheduleUpdate();
    }
    
    // 处理链接
    public processLinks(): void {
        const config = this.linkUtils.getConfig();
        if (!config.enabled) {
            return;
        }
        
        try {
            // 先检查并修复可能存在的重复文本问题
            this.checkAndFixRepeatedNames();
            
            // 收集所有链接
            const links = this.collectLinks();
            if (links.length === 0) {
                return;
            }
            
            logger.log(`收集到 ${links.length} 个链接，开始分批处理`);
            
            // 使用批处理来避免长时间阻塞UI
            this.linkUtils.processBatch(links, 0, (result) => {
                this.applyDisplayName(result);
            });
        } catch (e) {
            logger.error("处理阅读视图链接时发生错误:", e);
        }
    }
    
    // 检查并修复可能存在的重复文本问题
    private checkAndFixRepeatedNames(): void {
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
            const linkElements = Array.from(contentEl.querySelectorAll('a.internal-link')) as HTMLElement[];
            
            // 检查每个链接元素
            for (let i = 0; i < linkElements.length; i++) {
                const linkEl = linkElements[i] as HTMLElement;
                const text = linkEl.textContent;
                
                // 如果文本看起来是重复的，重置为原始路径
                if (this.isRepeatedText(text)) {
                    const originalPath = linkEl.dataset.originalPath;
                    if (originalPath) {
                        // 重置为原始文件名
                        const baseName = originalPath.split('/').pop()?.replace('.md', '') || originalPath;
                        linkEl.textContent = baseName;
                    }
                }
            }
        }
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        // 清空缓存
        this.fileNameIndex.clear();
        
        // 重置处理状态
        this.isProcessing = false;
        this.pendingUpdate = false;
        
        // 记录日志
        logger.debug('MarkdownLinkService资源已释放');
    }
} 