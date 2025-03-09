import { TFile } from 'obsidian';
import { IFilenameDisplayPlugin, FileDisplayResult } from '../types';
import { FilenameParser } from '../services/FilenameParser';
import { FileDisplayCache } from '../services/FileDisplayCache';
import { Logger } from './logger';

const logger = new Logger('FileProcessor');

/**
 * 共享的文件处理工具类，用于处理文件名称显示逻辑
 */
export class FileProcessor {
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
    }

    /**
     * 处理文件，获取显示名称
     * @param file 目标文件
     * @returns 文件显示结果
     */
    public processFile(file: TFile): FileDisplayResult {
        try {
            // 首先检查是否在启用的文件夹中
            if (!this.filenameParser.isFileInEnabledFolder(file)) {
                return { success: false, displayName: file.basename, error: 'File not in enabled folder' };
            }

            // 尝试从缓存获取
            const cachedResult = this.fileDisplayCache.getDisplayName(file.path);
            if (cachedResult) {
                return { success: true, displayName: cachedResult, fromCache: true };
            }
            
            // 否则从元数据获取显示名称
            const result = this.filenameParser.getDisplayNameFromMetadata(file);
            
            // 如果成功获取了名称，并且与默认的basename不同，则缓存结果
            if (result.success && result.displayName !== file.basename) {
                this.fileDisplayCache.setDisplayName(file.path, result.displayName);
            }
            
            return result;
        } catch (error) {
            logger.error(`处理文件 ${file.path} 时出错:`, error);
            return { 
                success: false, 
                displayName: file.basename, 
                error: error instanceof Error ? error.message : String(error) 
            };
        }
    }
    
    /**
     * 清除文件的缓存
     * @param file 目标文件
     */
    public clearFileCache(file: TFile): void {
        this.fileDisplayCache.deletePath(file.path);
    }
} 