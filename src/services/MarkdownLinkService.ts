import { MarkdownView, TFile } from 'obsidian';
import type { IFilenameDisplayPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';

export class MarkdownLinkService {
    private plugin: IFilenameDisplayPlugin;
    private filenameParser: FilenameParser;
    private fileDisplayCache: FileDisplayCache;

    constructor(
        plugin: IFilenameDisplayPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: FileDisplayCache
    ) {
        this.plugin = plugin;
        this.filenameParser = filenameParser;
        this.fileDisplayCache = fileDisplayCache;
        
        this.setupMarkdownPostProcessor();
    }

    // 设置Markdown后处理器以更新内部链接显示
    private setupMarkdownPostProcessor(): void {
        console.log('设置 Markdown 后处理器');
        this.plugin.registerMarkdownPostProcessor((element, context) => {
            // 仅在初始加载或后续变更时处理
            this.processMarkdownLinks(element);
        });
    }
    
    // 处理Markdown中的内部链接
    private processMarkdownLinks(element: HTMLElement): void {
        // 查找所有内部链接元素
        const linkElements = element.querySelectorAll('a.internal-link');
        if (linkElements.length > 0) {
            console.log(`找到 ${linkElements.length} 个内部链接`);
        } else {
            return; // 没有链接，提前返回
        }
        
        for (let i = 0; i < linkElements.length; i++) {
            const linkEl = linkElements[i] as HTMLElement;
            
            // 获取链接指向的文件路径
            const href = linkEl.getAttribute('href');
            if (!href) continue;
            
            // 获取原始链接文本
            const originalLinkText = linkEl.textContent;
            if (!originalLinkText) continue;
            
            try {
                // 从 href 中提取文件路径
                const filePath = this.getFilePathFromHref(href);
                if (!filePath) {
                    console.log(`无法从 ${href} 提取有效文件路径`);
                    continue;
                }
                
                // 查找对应的文件
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (!file) {
                    // 已经在getFilePathFromHref中记录了日志
                    continue;
                }
                
                if (file instanceof TFile) {
                    // 获取链接显示的文本
                    console.log(`找到文件: ${file.path}, 显示文本: ${originalLinkText}`);
                    
                    // 在Obsidian中，内部链接通常显示basename，除非用户使用了自定义显示文本
                    // 检查链接文本是否与文件basename匹配
                    if (originalLinkText === file.basename) {
                        const processResult = this.processFile(file);
                        if (processResult.success && processResult.displayName && 
                            processResult.displayName !== file.basename) {
                            // 更新链接文本
                            console.log(`更新链接文本: ${originalLinkText} -> ${processResult.displayName}`);
                            linkEl.textContent = processResult.displayName;
                            
                            // 确保链接保持可点击
                            linkEl.style.cursor = 'pointer';
                            
                            // 存储原始路径信息
                            linkEl.dataset.originalPath = filePath;
                            
                            // 确保点击事件有效
                            linkEl.addEventListener('click', (event) => {
                                const workspace = this.plugin.app.workspace;
                                const linkPath = linkEl.dataset.originalPath || filePath;
                                // 使用Obsidian API打开链接
                                workspace.openLinkText(linkPath, '', event.ctrlKey || event.metaKey);
                            });
                        }
                    } else {
                        console.log(`链接有自定义文本 "${originalLinkText}"，与文件名 "${file.basename}" 不同，保持不变`);
                    }
                }
            } catch (error) {
                console.error(`处理链接 "${originalLinkText}" 时出错:`, error);
            }
        }
    }

    // 处理文件以获取显示名称
    private processFile(file: TFile): FileDisplayResult {
        // 检查文件是否在启用的文件夹中
        if (!this.filenameParser.isFileInEnabledFolder(file)) {
            return {
                success: false,
                error: '文件不在启用的文件夹中',
                displayName: file.basename
            };
        }

        // 检查缓存
        if (this.fileDisplayCache.hasDisplayName(file.path)) {
            const cachedName = this.fileDisplayCache.getDisplayName(file.path);
            if (cachedName) {
                return {
                    success: true,
                    displayName: cachedName
                };
            }
        }

        // 使用metadataCache获取文件元数据，处理文件名
        const result = this.filenameParser.getDisplayNameFromMetadata(file);
        if (result.success && result.displayName) {
            this.fileDisplayCache.setDisplayName(file.path, result.displayName);
        }
        return result;
    }

    // 辅助方法：从 href 属性中提取文件路径
    private getFilePathFromHref(href: string): string | null {
        try {
            // 移除 # 后的部分（文档内部锚点）
            const parts = href.split('#');
            const pathPart = parts[0];
            
            // 解码 URI 组件
            let path = decodeURIComponent(pathPart);
            
            // 如果路径为空，返回null
            if (!path) return null;
            
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
            const allFiles = this.plugin.app.vault.getMarkdownFiles();
            
            // 首先检查文件名完全匹配的情况
            for (const aFile of allFiles) {
                if (aFile.basename === fileName || aFile.basename + '.md' === fileName) {
                    return aFile.path;
                }
            }
            
            // 最后检查文件名部分匹配的情况
            for (const aFile of allFiles) {
                if (aFile.basename.includes(fileName) || fileName.includes(aFile.basename)) {
                    return aFile.path;
                }
            }
            
            // 如果以上都没找到，则返回原始路径，让调用方自行判断
            console.log(`无法在库中找到匹配文件: ${path}，可能是别名或不存在的链接`);
            return path;
        } catch (error) {
            console.error("解析href路径时出错:", error);
            return null;
        }
    }

    // 更新指定文件在所有打开的Markdown视图中的内部链接
    public updateMarkdownLinksForFile(targetFile: TFile): void {
        console.log(`尝试更新文件 ${targetFile.path} 的所有内部链接引用`);
        
        // 获取所有打开的Markdown视图
        const markdownViews = this.plugin.app.workspace.getLeavesOfType('markdown');
        if (markdownViews.length === 0) {
            console.log('没有打开的Markdown视图');
            return;
        }
        
        console.log(`找到 ${markdownViews.length} 个打开的Markdown视图`);
        
        for (const view of markdownViews) {
            // 获取视图的内容元素
            const contentEl = view.view.containerEl.querySelector('.markdown-reading-view');
            if (!contentEl) {
                continue;
            }
            
            // 查找所有内部链接
            const links = contentEl.querySelectorAll('a.internal-link');
            console.log(`在视图中找到 ${links.length} 个内部链接`);
            
            for (let i = 0; i < links.length; i++) {
                const linkEl = links[i] as HTMLElement;
                const href = linkEl.getAttribute('href');
                if (!href) continue;
                
                const originalLinkText = linkEl.textContent;
                if (!originalLinkText) continue;
                
                try {
                    const filePath = this.getFilePathFromHref(href);
                    if (!filePath) continue;
                    
                    // 检查是否指向目标文件的不同方式
                    const pointsToTargetFile = 
                        filePath === targetFile.path || 
                        filePath === targetFile.basename || 
                        (filePath.endsWith('.md') && filePath.substring(0, filePath.length - 3) === targetFile.basename);
                    
                    if (pointsToTargetFile) {
                        console.log(`找到指向目标文件的链接: ${originalLinkText}`);
                        
                        // 如果链接文本与文件基本名称相同
                        if (originalLinkText === targetFile.basename) {
                            const processResult = this.processFile(targetFile);
                            if (processResult.success && processResult.displayName &&
                                processResult.displayName !== targetFile.basename) {
                                // 更新链接文本
                                console.log(`更新链接文本: ${originalLinkText} -> ${processResult.displayName}`);
                                linkEl.textContent = processResult.displayName;
                                
                                // 确保链接保持可点击
                                linkEl.style.cursor = 'pointer';
                                
                                // 存储原始路径信息
                                linkEl.dataset.originalPath = filePath;
                                
                                // 确保点击事件有效
                                linkEl.addEventListener('click', (event) => {
                                    const workspace = this.plugin.app.workspace;
                                    const linkPath = linkEl.dataset.originalPath || filePath;
                                    // 使用Obsidian API打开链接
                                    workspace.openLinkText(linkPath, '', event.ctrlKey || event.metaKey);
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.error(`更新链接时出错:`, error);
                }
            }
        }
    }
} 