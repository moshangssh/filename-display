import { TFile } from 'obsidian';
import type { ITitleExtractorPlugin, FileDisplayResult } from '../types';
import { IFilenameParser, IFileDisplayCache, ILoggerService } from '../services/interfaces/IServices';

/**
 * 文件处理基类，集中通用的文件处理逻辑
 * 所有需要处理文件显示名称的类应该继承此类
 */
export abstract class BaseFileProcessor {
    protected plugin: ITitleExtractorPlugin;
    protected filenameParser: IFilenameParser;
    protected fileDisplayCache: IFileDisplayCache;
    protected logger: ILoggerService;

    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: IFilenameParser,
        fileDisplayCache: IFileDisplayCache,
        loggerService: ILoggerService
    ) {
        this.plugin = plugin;
        this.filenameParser = filenameParser;
        this.fileDisplayCache = fileDisplayCache;
        this.logger = loggerService.getLogger(this.constructor.name);
    }

    /**
     * 处理文件，获取显示名称
     * 核心处理逻辑，所有子类共享
     */
    public processFile(file: TFile): FileDisplayResult {
        try {
            // 检查文件是否在启用的文件夹中
            if (!this.isFileInEnabledFolder(file)) {
                return { 
                    success: false, 
                    displayName: file.basename, 
                    error: '文件不在启用的文件夹中' 
                };
            }

            // 尝试从缓存获取
            const cachedResult = this.getCachedDisplayName(file.path);
            if (cachedResult) {
                return cachedResult;
            }
            
            // 否则从元数据获取显示名称
            const result = this.getDisplayNameFromFile(file);
            
            // 缓存结果
            this.cacheDisplayResult(file.path, result);
            
            return result;
        } catch (error) {
            this.logger.error(`处理文件 ${file.path} 时出错:`, error);
            return { 
                success: false, 
                displayName: file.basename, 
                error: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * 检查文件是否在启用的文件夹中
     */
    protected isFileInEnabledFolder(file: TFile): boolean {
        return this.filenameParser.isFileInEnabledFolder(file);
    }

    /**
     * 从缓存获取显示名称
     */
    protected getCachedDisplayName(path: string): FileDisplayResult | null {
        if (this.fileDisplayCache.hasDisplayName(path)) {
            const cachedName = this.fileDisplayCache.getDisplayName(path);
            if (cachedName) {
                return { 
                    success: true, 
                    displayName: cachedName, 
                    fromCache: true 
                };
            }
        }
        return null;
    }

    /**
     * 从文件获取显示名称
     */
    protected getDisplayNameFromFile(file: TFile): FileDisplayResult {
        return this.filenameParser.getDisplayNameFromMetadata(file);
    }

    /**
     * 缓存显示结果
     */
    protected cacheDisplayResult(path: string, result: FileDisplayResult): void {
        if (result.success && result.displayName) {
            this.fileDisplayCache.setDisplayName(path, result.displayName);
        }
    }
    
    /**
     * 清除文件的缓存
     */
    public clearFileCache(file: TFile): void {
        this.fileDisplayCache.deletePath(file.path);
    }
} 