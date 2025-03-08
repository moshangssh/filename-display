import { TFile, normalizePath } from 'obsidian';
import type { IFilenameDisplayPlugin, FileDisplayResult } from '../types';

// 文件名解析器类，负责文件显示名称的提取逻辑
export class FilenameParser {
    private plugin: IFilenameDisplayPlugin;
    
    constructor(plugin: IFilenameDisplayPlugin) {
        this.plugin = plugin;
    }
    
    // 从元数据获取显示名称
    public getDisplayNameFromMetadata(file: TFile): FileDisplayResult {
        try {
            // 获取文件的缓存元数据
            const metadata = this.plugin.app.metadataCache.getFileCache(file);
            
            // 使用文件名作为基础数据
            let baseText = file.basename;
            let fromFrontmatter = false;
            
            // 检查是否有前置元数据标题
            const hasFrontmatterTitle = this.plugin.settings.useYamlTitleWhenAvailable && 
                metadata?.frontmatter && 
                'title' in metadata.frontmatter;
                
            // 处理前置元数据标题
            if (hasFrontmatterTitle && metadata?.frontmatter) {
                baseText = String(metadata.frontmatter.title).trim();
                fromFrontmatter = true;
                
                // 如果配置为优先使用元数据标题，直接返回
                if (this.plugin.settings.preferFrontmatterTitle) {
                    return { success: true, displayName: baseText };
                }
            }
            
            // 尝试使用正则表达式提取文件名（如果不优先使用前置元数据标题或没有前置元数据标题）
            if (!this.plugin.settings.preferFrontmatterTitle || !fromFrontmatter) {
                const regexResult = this.extractDisplayName(file.basename);
                if (regexResult.success && regexResult.displayName) {
                    return regexResult;
                }
            }
            
            // 如果上述都未提取成功，但有前置元数据标题，则使用它
            if (fromFrontmatter) {
                return { success: true, displayName: baseText };
            }
            
            // 最后，返回使用文件名作为显示名
            return { success: false, displayName: file.basename, error: '未能从文件名中提取显示名' };
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return { 
                success: false, 
                error: `元数据处理错误: ${error}`,
                displayName: file.basename 
            };
        }
    }

    // 使用正则表达式提取文件名
    public extractDisplayName(filename: string): FileDisplayResult {
        if (!filename || typeof filename !== 'string') {
            return { 
                success: false, 
                error: `无效的文件名: ${filename}`,
                displayName: String(filename || '') 
            };
        }

        try {
            // 验证正则表达式的有效性
            let regex: RegExp;
            try {
                regex = new RegExp(this.plugin.settings.pattern);
            } catch (regexError) {
                const error = regexError instanceof Error ? regexError.message : String(regexError);
                return { 
                    success: false, 
                    error: `正则表达式无效: ${error}`,
                    displayName: filename 
                };
            }

            // 执行正则匹配
            const match = filename.match(regex);
            if (!match) {
                return { 
                    success: false, 
                    error: `没有匹配的内容: ${regex.toString()}`,
                    displayName: filename 
                };
            }

            // 优先使用捕获组
            if (match[1]) {
                if (match[1].trim().length === 0) {
                    return { 
                        success: false, 
                        error: '匹配结果为空字符串',
                        displayName: filename 
                    };
                }
                return { success: true, displayName: match[1] };
            }
            
            // 回退到完整匹配
            if (match[0]) {
                if (match[0].trim().length === 0) {
                    return { 
                        success: false, 
                        error: '匹配结果为空字符串',
                        displayName: filename 
                    };
                }
                return { success: true, displayName: match[0] };
            }
            
            return { 
                success: false, 
                error: '无匹配结果',
                displayName: filename 
            };
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            console.error('文件名解析错误:', error);
            return { 
                success: false, 
                error: `正则处理错误: ${error}`,
                displayName: filename 
            };
        }
    }
    
    // 检查文件是否在指定的生效目录中
    public isFileInEnabledFolder(file: TFile): boolean {
        // 如果没有指定目录，则对所有文件生效
        if (!this.plugin.settings.enabledFolders || this.plugin.settings.enabledFolders.length === 0) {
            return true;
        }
        
        // 检查文件路径是否在指定目录中
        const filePath = file.path;
        return this.plugin.settings.enabledFolders.some(folder => {
            // 空字符串应该匹配所有路径
            if (folder.trim() === '') {
                return true;
            }
            
            const normalizedFolder = normalizePath(folder);
            
            // 检查文件是否就是该文件夹
            if (filePath === normalizedFolder) {
                return true;
            }
            
            // 检查文件是否在该文件夹内（确保以路径分隔符结尾以避免前缀匹配错误）
            // 例如："folder" 不应该匹配 "folder2/file.md"，但应该匹配 "folder/file.md"
            return filePath.startsWith(normalizedFolder + '/');
        });
    }
} 