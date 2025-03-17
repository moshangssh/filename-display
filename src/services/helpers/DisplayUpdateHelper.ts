import { TFile } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../../types';
import { IFilenameParser, IFileDisplayCache, ILoggerService } from '../interfaces/IServices';

/**
 * 显示更新辅助类，提取文件处理服务中的共享逻辑
 */
export class DisplayUpdateHelper {
    private plugin: ITitleExtractorPlugin;
    private filenameParser: IFilenameParser;
    private fileDisplayCache: IFileDisplayCache;
    private logger: ILoggerService;

    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: IFilenameParser,
        fileDisplayCache: IFileDisplayCache,
        loggerService: ILoggerService
    ) {
        this.plugin = plugin;
        this.filenameParser = filenameParser;
        this.fileDisplayCache = fileDisplayCache;
        this.logger = loggerService.getLogger('DisplayUpdateHelper');
    }

    /**
     * 处理文件以获取显示名称
     * @param file 要处理的文件
     * @returns 文件处理结果
     */
    public processFile(file: TFile): FileDisplayResult {
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

        // 使用FilenameParser处理文件
        const result = this.filenameParser.getDisplayNameFromMetadata(file);
        if (result.success && result.displayName) {
            this.fileDisplayCache.setDisplayName(file.path, result.displayName);
        }
        return result;
    }

    /**
     * 应用显示名称到HTML元素
     * @param titleEl 标题元素
     * @param file 文件对象
     * @param result 处理结果
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
     * 更新文件元素显示
     * @param titleEl 标题元素
     * @param file 文件对象
     */
    public updateFileElement(titleEl: HTMLElement, file: TFile): void {
        if (!this.filenameParser.isFileInEnabledFolder(file)) {
            // 如果文件不在启用的文件夹中，恢复为原始名称
            this.restoreDisplayName(titleEl);
            return;
        }

        // 获取原始显示名称并存储
        const originalName = titleEl.textContent || file.basename;
        this.fileDisplayCache.saveOriginalName(file.path, originalName);
        
        // 使用 WeakMap 保存元素与文件路径和原始名称的关系
        this.fileDisplayCache.saveElementData(titleEl, file.path, originalName);
        
        // 处理文件名获取显示名称
        const processResult = this.processFile(file);
        
        // 应用显示名称到元素
        this.applyDisplayNameToElement(titleEl, file, processResult);
    }

    /**
     * 恢复单个元素的显示名称
     * @param titleEl 标题元素
     */
    public restoreDisplayName(titleEl: HTMLElement): void {
        // 首先尝试从 WeakMap 中获取信息
        const elementData = this.fileDisplayCache.getElementData(titleEl);
        if (elementData) {
            titleEl.textContent = elementData.originalName;
            titleEl.removeAttribute('aria-label');
            titleEl.classList.remove('filename-display-error');
            return;
        }
        
        // 如果 WeakMap 中没有，回退到使用 path 属性查找
        const filePath = titleEl.getAttribute('data-path');
        if (filePath) {
            const originalName = this.fileDisplayCache.getOriginalName(filePath);
            if (originalName) {
                titleEl.textContent = originalName;
                titleEl.removeAttribute('aria-label');
                titleEl.classList.remove('filename-display-error');
            }
        }
    }
} 