import { TFile } from 'obsidian';
import { ILoggerService, IFileDisplayCache, IFilenameParser } from '../interfaces/IServices';
import { FileDisplayResult } from '../../types';
import { BaseFileProcessor } from '../../core/BaseFileProcessor';

/**
 * 文件名显示管理器
 * 专门负责处理文件名显示逻辑，分离自文件处理服务
 */
export class FileNameDisplayManager {
    private fileDisplayCache: IFileDisplayCache;
    private filenameParser: IFilenameParser;
    private logger: ILoggerService;

    constructor(
        fileDisplayCache: IFileDisplayCache,
        filenameParser: IFilenameParser,
        loggerService: ILoggerService
    ) {
        this.fileDisplayCache = fileDisplayCache;
        this.filenameParser = filenameParser;
        this.logger = loggerService.getLogger('FileNameDisplayManager');
        this.logger.debug('FileNameDisplayManager 初始化完成');
    }

    /**
     * 应用显示名称到HTML元素
     */
    public applyDisplayNameToElement(titleEl: HTMLElement, file: TFile, result: FileDisplayResult): void {
        if (!result.success || !result.displayName) {
            // 如果处理出错，显示错误样式
            titleEl.classList.add('filename-display-error');
            if (result.error) {
                titleEl.setAttribute('aria-label', result.error);
            }
            return;
        }

        // 更新显示名称
        titleEl.textContent = result.displayName;
        titleEl.classList.remove('filename-display-error');
        
        // 如果显示名称与实际文件名不同，设置工具提示
        if (result.displayName !== file.basename) {
            titleEl.setAttribute('aria-label', file.basename);
        } else {
            titleEl.removeAttribute('aria-label');
        }
    }

    /**
     * 处理文件元素，获取并应用显示名称
     */
    public processAndApplyDisplayName(titleEl: HTMLElement, file: TFile): void {
        if (!this.filenameParser.isFileInEnabledFolder(file)) {
            // 如果文件不在启用的文件夹中，恢复为原始名称
            this.restoreDisplayName(titleEl);
            return;
        }

        // 获取原始显示名称并存储
        const originalName = titleEl.textContent || file.basename;
        this.fileDisplayCache.saveOriginalName(file.path, originalName);
        
        // 使用缓存保存元素与文件路径和原始名称的关系
        this.fileDisplayCache.saveElementData(titleEl, file.path, originalName);
        
        try {
            // 尝试从缓存获取显示名称
            let displayResult: FileDisplayResult | null = null;
            
            if (this.fileDisplayCache.hasDisplayName(file.path)) {
                const cachedName = this.fileDisplayCache.getDisplayName(file.path);
                if (cachedName) {
                    displayResult = { 
                        success: true, 
                        displayName: cachedName, 
                        fromCache: true 
                    };
                }
            }
            
            // 如果缓存中没有，则从文件获取
            if (!displayResult) {
                displayResult = this.filenameParser.getDisplayNameFromMetadata(file);
                
                // 如果成功获取，则缓存结果
                if (displayResult.success && displayResult.displayName) {
                    this.fileDisplayCache.setDisplayName(file.path, displayResult.displayName);
                }
            }
            
            // 应用显示名称到元素
            this.applyDisplayNameToElement(titleEl, file, displayResult);
        } catch (error) {
            this.logger.error(`处理文件 ${file.path} 显示时出错:`, error);
            const errorResult: FileDisplayResult = {
                success: false,
                displayName: file.basename,
                error: error instanceof Error ? error.message : String(error)
            };
            this.applyDisplayNameToElement(titleEl, file, errorResult);
        }
    }

    /**
     * 恢复元素的原始显示名称
     */
    public restoreDisplayName(titleEl: HTMLElement): void {
        try {
            // 从缓存中获取原始名称
            const pathData = this.fileDisplayCache.getElementData(titleEl);
            if (pathData && pathData.originalName) {
                titleEl.textContent = pathData.originalName;
                titleEl.removeAttribute('aria-label');
                titleEl.classList.remove('filename-display-error');
            }
        } catch (error) {
            this.logger.error('恢复显示名称时出错:', error);
        }
    }

    /**
     * 批量处理文件元素
     */
    public batchProcessElements(elements: HTMLElement[], files: TFile[]): void {
        if (elements.length !== files.length) {
            this.logger.warn('元素数量与文件数量不匹配');
            return;
        }

        for (let i = 0; i < elements.length; i++) {
            this.processAndApplyDisplayName(elements[i], files[i]);
        }
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        // 清理逻辑
        this.logger.debug('FileNameDisplayManager 资源已释放');
    }
} 