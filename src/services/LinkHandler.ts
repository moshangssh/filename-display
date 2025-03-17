import { TFile } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { FileDisplayCache } from './FileDisplayCache';
import { Logger } from '../utils/logger';

// 创建服务特定的日志记录器
const logger = new Logger('LinkHandler');

// 链接信息接口，描述链接的基本属性
export interface LinkInfo {
    text: string;          // 链接显示的文本
    path: string;          // 链接指向的路径
    file?: TFile;          // 链接指向的文件对象（如果存在）
    element?: HTMLElement; // 链接对应的DOM元素（只在阅读视图中使用）
    from?: number;         // 链接在编辑器中的起始位置（只在编辑器视图中使用）
    to?: number;           // 链接在编辑器中的结束位置（只在编辑器视图中使用）
}

// 链接处理结果接口
export interface LinkProcessResult {
    success: boolean;                 // 处理是否成功
    originalInfo: LinkInfo;           // 原始链接信息
    displayName?: string;             // 处理后的显示名称
    shouldUpdate: boolean;            // 是否需要更新链接显示
}

// 链接处理配置接口
export interface LinkHandlerConfig {
    enabled: boolean;                  // 是否启用链接处理
    respectCustomLinkText: boolean;    // 是否尊重自定义链接文本
    processingScope?: string;          // 处理范围 (editor, preview, both)
}

// 抽象链接处理类
export abstract class LinkHandler {
    protected plugin: ITitleExtractorPlugin;
    protected filenameParser: FilenameParser;
    protected fileDisplayCache: FileDisplayCache;
    protected config: LinkHandlerConfig;
    // 添加批处理相关属性
    protected readonly BATCH_SIZE = 25; // 每批处理的链接数量
    protected readonly BATCH_DELAY = 0; // 批次间延迟(毫秒)

    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: FileDisplayCache,
        config?: Partial<LinkHandlerConfig>
    ) {
        this.plugin = plugin;
        this.filenameParser = filenameParser;
        this.fileDisplayCache = fileDisplayCache;
        
        // 默认配置
        this.config = {
            enabled: true,
            respectCustomLinkText: true,
            processingScope: 'both',
            ...config
        };
    }

    // 设置配置
    public setConfig(newConfig: Partial<LinkHandlerConfig>): void {
        this.config = {
            ...this.config,
            ...newConfig
        };
    }

    // 检查文本是否看起来是重复的（如AAAABBBBAAAABBBB）
    protected isRepeatedText(text: string | null): boolean {
        if (!text || text.length < 4) return false;
        
        const halfLength = Math.floor(text.length / 2);
        const firstHalf = text.substring(0, halfLength);
        const secondHalf = text.substring(halfLength, halfLength * 2);
        
        // 检查前半部分是否与后半部分相同
        return firstHalf === secondHalf;
    }

    // 检查并修复重复文本的通用方法
    protected checkAndFixRepeatedNames(linkElements: NodeListOf<Element> | HTMLElement[]): void {
        for (let i = 0; i < linkElements.length; i++) {
            const linkEl = linkElements[i] as HTMLElement;
            const text = linkEl.textContent || '';
            
            // 如果文本看起来是重复的，则修复它
            if (this.isRepeatedText(text)) {
                logger.log(`检测到重复文本: ${text}，正在修复...`);
                
                // 获取原始路径
                const originalPath = linkEl.dataset.originalPath;
                const href = linkEl.getAttribute('href');
                
                if (originalPath || href) {
                    const path = originalPath || href;
                    if (!path) continue;
                    
                    // 查找对应的文件
                    const file = this.plugin.app.vault.getAbstractFileByPath(path);
                    if (!(file instanceof TFile)) continue;
                    
                    // 获取正确的显示名称
                    const result = this.processFile(file);
                    if (result.success && result.displayName) {
                        // 更新文本
                        linkEl.textContent = result.displayName;
                        logger.log(`已修复重复文本: ${text} -> ${result.displayName}`);
                    } else {
                        // 如果无法获取正确名称，至少删除重复部分
                        const halfLength = Math.floor(text.length / 2);
                        linkEl.textContent = text.substring(0, halfLength);
                        logger.log(`已移除重复部分: ${text} -> ${linkEl.textContent}`);
                    }
                }
            }
        }
    }

    // 处理文件，获取显示名称
    protected processFile(file: TFile): FileDisplayResult {
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
                    displayName: cachedName,
                    fromCache: true
                };
            }
        }

        // 使用元数据获取文件名
        const result = this.filenameParser.getDisplayNameFromMetadata(file);
        if (result.success && result.displayName) {
            this.fileDisplayCache.setDisplayName(file.path, result.displayName);
        }
        return result;
    }

    // 从链接路径获取文件
    protected getFileFromLink(linkPath: string): TFile | undefined {
        const file = this.plugin.app.metadataCache.getFirstLinkpathDest(
            linkPath,
            ''
        );
        return file || undefined;
    }

    // 处理单个链接信息
    protected processLinkInfo(linkInfo: LinkInfo): LinkProcessResult {
        // 初始化处理结果
        const result: LinkProcessResult = {
            success: false,
            originalInfo: linkInfo,
            shouldUpdate: false
        };

        // 如果没有关联的文件，尝试获取
        if (!linkInfo.file) {
            linkInfo.file = this.getFileFromLink(linkInfo.path);
        }

        // 如果找不到文件，返回失败
        if (!linkInfo.file) {
            return result;
        }

        // 获取文件的显示名称
        const displayResult = this.processFile(linkInfo.file);
        
        // 如果处理成功并有显示名称
        if (displayResult.success && displayResult.displayName) {
            result.success = true;
            result.displayName = displayResult.displayName;
            
            // 判断是否需要更新链接文本
            
            // 1. 如果是自定义链接文本且设置为尊重自定义文本
            const hasCustomText = linkInfo.text !== linkInfo.path && 
                                linkInfo.text !== linkInfo.file.basename;
            
            if (hasCustomText && this.config.respectCustomLinkText) {
                // 不更新自定义链接文本
                result.shouldUpdate = false;
                return result;
            }
            
            // 2. 如果显示名称与当前文本不同，需要更新
            result.shouldUpdate = linkInfo.text !== displayResult.displayName;
        }

        return result;
    }

    // 子类需要实现的抽象方法，用于将显示名称应用到链接
    protected abstract applyDisplayName(linkProcessResult: LinkProcessResult): void;
    
    // 子类需要实现的抽象方法，用于获取所有需要处理的链接
    protected abstract collectLinks(): LinkInfo[];
    
    // 处理所有链接的公共方法
    public processLinks(): void {
        try {
            // 检查是否启用
            if (!this.config.enabled) {
                return;
            }
            
            // 收集所有链接
            const links = this.collectLinks();
            if (links.length === 0) {
                return;
            }
            
            logger.log(`收集到 ${links.length} 个链接，开始分批处理`);
            
            // 使用批处理来避免长时间阻塞UI
            this.processBatch(links, 0);
        } catch (error) {
            logger.error("处理链接时出现错误:", error);
        }
    }
    
    // 批量处理链接的新方法
    private processBatch(links: LinkInfo[], startIndex: number): void {
        // 如果处理完所有链接，返回
        if (startIndex >= links.length) {
            logger.log('所有链接批处理完成');
            return;
        }
        
        // 计算当前批次的结束索引
        const endIndex = Math.min(startIndex + this.BATCH_SIZE, links.length);
        
        // 处理当前批次的链接
        for (let i = startIndex; i < endIndex; i++) {
            const result = this.processLinkInfo(links[i]);
            if (result.success && result.shouldUpdate) {
                this.applyDisplayName(result);
            }
        }
        
        // 安排下一批处理，使用setTimeout允许UI更新
        setTimeout(() => {
            this.processBatch(links, endIndex);
        }, this.BATCH_DELAY);
    }
} 