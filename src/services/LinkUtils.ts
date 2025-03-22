import { TFile } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from './FilenameParser';
import { IFileDisplayCache, ILoggerService } from './interfaces/IServices';
import { LoggerService } from "./LoggerService";
import { BaseFileProcessor } from '../core/BaseFileProcessor';

// 创建服务特定的日志记录器
const logger = new LoggerService('LinkUtils');

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

/**
 * 链接处理工具类，提供通用的链接处理功能
 */
export class LinkUtils extends BaseFileProcessor {
    private config: LinkHandlerConfig;
    public readonly BATCH_SIZE = 25; // 每批处理的链接数量
    public readonly BATCH_DELAY = 0; // 批次间延迟(毫秒)

    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: IFileDisplayCache,
        loggerService: ILoggerService,
        config?: Partial<LinkHandlerConfig>
    ) {
        super(plugin, filenameParser, fileDisplayCache, loggerService);
        
        // 默认配置
        this.config = {
            enabled: true,
            respectCustomLinkText: true,
            processingScope: 'both',
            ...config
        };
    }

    /**
     * 从链接路径获取文件
     * @param linkPath 链接路径
     * @returns 文件对象或undefined
     */
    public getFileFromLink(linkPath: string): TFile | undefined {
        const file = this.plugin.app.metadataCache.getFirstLinkpathDest(
            linkPath,
            ''
        );
        return file || undefined;
    }

    /**
     * 处理单个链接信息
     * @param linkInfo 链接信息
     * @returns 链接处理结果
     */
    public processLinkInfo(linkInfo: LinkInfo): LinkProcessResult {
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

    /**
     * 获取当前配置
     * @returns 链接处理配置
     */
    public getConfig(): LinkHandlerConfig {
        return this.config;
    }

    /**
     * 处理批次的链接
     * @param links 待处理的链接
     * @param startIndex 开始处理的索引
     * @param callback 处理回调函数
     */
    public processBatch(
        links: LinkInfo[], 
        startIndex: number,
        callback: (result: LinkProcessResult) => void
    ): void {
        if (!this.config.enabled || startIndex >= links.length) {
            return;
        }
        
        // 计算本批次的结束索引
        const endIndex = Math.min(startIndex + this.BATCH_SIZE, links.length);
        
        // 处理当前批次的链接
        for (let i = startIndex; i < endIndex; i++) {
            try {
                const result = this.processLinkInfo(links[i]);
                if (result.success && result.shouldUpdate) {
                    callback(result);
                }
            } catch (e) {
                this.logger.error(`处理链接 ${i} 时出错: ${e}`);
            }
        }
        
        // 如果还有未处理的链接，安排下一批处理
        if (endIndex < links.length) {
            setTimeout(() => {
                this.processBatch(links, endIndex, callback);
            }, this.BATCH_DELAY);
        }
    }

    /**
     * 从href属性中提取文件路径
     * @param href 链接的href属性值
     * @returns 解析后的文件路径或undefined
     */
    public getFilePathFromHref(href: string): string | undefined {
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
            
            // 4. 尝试规范化文件名中的特殊字符
            // 处理可能包含特殊字符的文件名（例如将下划线替换为空格）
            if (path.includes('_')) {
                const normalizedPath = path.replace(/_/g, ' ');
                file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
                if (file) return normalizedPath;
                
                // 同时尝试带 .md 后缀的版本
                if (!normalizedPath.endsWith('.md')) {
                    const normalizedPathWithExt = normalizedPath + '.md';
                    file = this.plugin.app.vault.getAbstractFileByPath(normalizedPathWithExt);
                    if (file) return normalizedPathWithExt;
                }
            }
            
            // 5. 使用 getFirstLinkpathDest 进行更智能的查找（用于别名和其他情况）
            const linkedFile = this.plugin.app.metadataCache.getFirstLinkpathDest(path, '');
            if (linkedFile) {
                return linkedFile.path;
            }
            
            // 如果包含特殊字符，尝试使用 getFirstLinkpathDest
            if (path.includes('_') || path.includes(' ')) {
                // 尝试使用规范化路径
                const altPath = path.includes('_') ? path.replace(/_/g, ' ') : path.replace(/ /g, '_');
                const altFile = this.plugin.app.metadataCache.getFirstLinkpathDest(altPath, '');
                if (altFile) {
                    return altFile.path;
                }
            }
            
            this.logger.debug(`无法在库中找到匹配文件: ${path}，可能是别名或不存在的链接`);
            return undefined;
        } catch (error) {
            this.logger.error('解析链接路径出错:', error);
            return undefined;
        }
    }
    
    /**
     * 批量处理链接和装饰
     * @param links 待处理的链接
     * @param callback 处理回调函数
     */
    public processBatchWithDelay(
        links: LinkInfo[],
        callback: (result: LinkProcessResult) => void
    ): void {
        if (!this.config.enabled || links.length === 0) {
            return;
        }
        
        // 开始处理第一批
        this.processBatch(links, 0, callback);
    }
} 