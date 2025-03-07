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
            
            // 如果启用了YAML前置元数据标题功能，并且文件有元数据标题
            if (this.plugin.settings.useYamlTitleWhenAvailable && 
                metadata?.frontmatter && 
                'title' in metadata.frontmatter) {
                
                baseText = String(metadata.frontmatter.title);
                fromFrontmatter = true;
                
                // 如果配置为优先使用元数据标题，直接返回
                if (this.plugin.settings.preferFrontmatterTitle) {
                    return { success: true, displayName: baseText };
                }
            }
            
            // 如果未从前置元数据获取标题，或者配置为不优先使用元数据标题
            if (!fromFrontmatter || !this.plugin.settings.preferFrontmatterTitle) {
                // 应用正则提取文件名
                const regexResult = this.extractDisplayName(file.basename);
                
                // 如果正则提取成功，使用提取结果
                if (regexResult.success && regexResult.displayName) {
                    return regexResult;
                }
            }
            
            // 如果上述都没有匹配到，但有从前置元数据获取的标题，使用该标题
            if (fromFrontmatter) {
                return { success: true, displayName: baseText };
            }
            
            // 最后的后备选项：使用原始文件名
            return { 
                success: true, 
                displayName: file.basename 
            };
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
        try {
            const regex = new RegExp(this.plugin.settings.pattern);
            const match = filename.match(regex);
            if (match && match[1]) {
                return { success: true, displayName: match[1] };
            }
            if (match && match[0]) {
                return { success: true, displayName: match[0] };
            }
            return { 
                success: false, 
                error: '无匹配结果',
                displayName: filename 
            };
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
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
            const normalizedFolder = normalizePath(folder);
            return filePath === normalizedFolder || 
                   filePath.startsWith(normalizedFolder + '/');
        });
    }
} 