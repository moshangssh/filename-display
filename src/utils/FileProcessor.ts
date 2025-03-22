import { TFile } from 'obsidian';
import { ITitleExtractorPlugin } from '../types';
import { FilenameParser } from '../services/FilenameParser';
import { IFileDisplayCache, ILoggerService } from '../services/interfaces/IServices';
import { BaseFileProcessor } from '../core/BaseFileProcessor';

/**
 * 共享的文件处理工具类，用于处理文件名称显示逻辑
 * 继承自 BaseFileProcessor 基类
 */
export class FileProcessor extends BaseFileProcessor {
    constructor(
        plugin: ITitleExtractorPlugin,
        filenameParser: FilenameParser,
        fileDisplayCache: IFileDisplayCache,
        loggerService: ILoggerService
    ) {
        super(plugin, filenameParser, fileDisplayCache, loggerService);
    }
    
    /**
     * 这里可以添加 FileProcessor 特有的方法
     */
} 