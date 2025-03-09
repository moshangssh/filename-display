import { TFile } from 'obsidian';
import type { IFilenameDisplayPlugin, FileDisplayResult } from '../types';
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
    protected plugin: IFilenameDisplayPlugin;
    protected filenameParser: FilenameParser;
    protected fileDisplayCache: FileDisplayCache;
    protected config: LinkHandlerConfig;

    constructor(
        plugin: IFilenameDisplayPlugin,
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
        // 移除子部分引用 (#)
        const basePath = linkPath.split('#')[0];
        return this.plugin.app.metadataCache.getFirstLinkpathDest(basePath, '') || undefined;
    }

    // 处理链接信息，获取处理结果
    protected processLinkInfo(linkInfo: LinkInfo): LinkProcessResult {
        try {
            // 如果没有关联文件，尝试获取
            if (!linkInfo.file) {
                linkInfo.file = this.getFileFromLink(linkInfo.path);
            }

            // 如果仍然没有文件，返回处理失败
            if (!linkInfo.file) {
                return {
                    success: false,
                    originalInfo: linkInfo,
                    shouldUpdate: false
                };
            }

            // 获取文件原始basename
            const originalBasename = linkInfo.file.basename;

            // 如果链接文本不等于文件basename，且配置为尊重自定义文本，则不处理
            if (this.config.respectCustomLinkText && linkInfo.text !== originalBasename) {
                return {
                    success: true,
                    originalInfo: linkInfo,
                    shouldUpdate: false
                };
            }

            // 处理文件获取显示名称
            const processResult = this.processFile(linkInfo.file);
            
            // 如果处理成功且显示名称与原始名称不同，返回需要更新
            if (processResult.success && 
                processResult.displayName && 
                processResult.displayName !== originalBasename) {
                return {
                    success: true,
                    originalInfo: linkInfo,
                    displayName: processResult.displayName,
                    shouldUpdate: true
                };
            }

            // 默认情况下不需要更新
            return {
                success: true,
                originalInfo: linkInfo,
                shouldUpdate: false
            };
        } catch (error) {
            logger.error(`处理链接 "${linkInfo.text}" 时出错:`, error);
            return {
                success: false,
                originalInfo: linkInfo,
                shouldUpdate: false
            };
        }
    }

    // 子类需要实现的抽象方法，用于应用显示名称到链接
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
            
            logger.log(`收集到 ${links.length} 个链接，开始处理`);
            
            // 处理每个链接
            for (const linkInfo of links) {
                const result = this.processLinkInfo(linkInfo);
                if (result.success && result.shouldUpdate) {
                    this.applyDisplayName(result);
                }
            }
        } catch (error) {
            logger.error("处理链接时出现错误:", error);
        }
    }
} 