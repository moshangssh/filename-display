import { TFile } from 'obsidian';
import { DisplayManagerConfig } from '../types';
import { RegexCache } from '../utils/regexCache';

/**
 * 文件名映射项接口，表示原始名称和显示名称之间的关系
 */
export interface NameMapping {
    originalName: string;
    displayName: string;
}

/**
 * 文件名显示管理器类
 * 负责根据配置规则转换文件名并生成相应的CSS样式
 */
export class DisplayManager {
    private styleEl: HTMLStyleElement | null = null;
    private cssRulesCache: Map<string, string> = new Map();
    private nameMapping: Map<string, string> = new Map();
    
    constructor(private config: DisplayManagerConfig) {
        // 创建样式元素
        this.createStyleElement();
    }
    
    /**
     * 更新配置
     */
    public updateConfig(config: Partial<DisplayManagerConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 根据配置的规则转换文件名
     */
    public getUpdatedFileName(originalName: string): string | null {
        try {
            // 移除文件扩展名
            const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
            
            // 使用配置的正则表达式进行匹配
            const regex = RegexCache.getInstance().get(this.config.fileNamePattern);
            const match = nameWithoutExt.match(regex);
            
            // 验证捕获组索引是否有效
            if (match && this.config.captureGroup >= 0 && this.config.captureGroup < match.length) {
                const result = match[this.config.captureGroup];
                // 确保结果不为空
                return result?.trim() || this.getFallbackName(nameWithoutExt);
            }
            
            // 如果匹配失败或捕获组无效，使用回退名称
            return this.getFallbackName(nameWithoutExt);
        } catch (error) {
            // 记录错误并使用回退名称
            console.error('文件名处理错误:', error);
            return this.getFallbackName(originalName);
        }
    }
    
    /**
     * 获取回退的显示名称
     */
    private getFallbackName(originalName: string): string {
        // 如果原始名称过长，截取合适长度
        const MAX_LENGTH = 30;
        if (originalName.length > MAX_LENGTH) {
            return originalName.substring(0, MAX_LENGTH - 3) + '...';
        }
        return originalName;
    }
    
    /**
     * 生成文件的CSS规则
     */
    public generateCssRule(file: TFile, newName: string): string {
        const escapedPath = CSS.escape(file.path);
        const escapedName = CSS.escape(newName);
        
        return `
            /* 文件树导航栏 */
            [data-path="${escapedPath}"] .nav-file-title-content {
                color: transparent;
            }
            [data-path="${escapedPath}"] .nav-file-title-content::before {
                content: "${escapedName}";
            }
            
            /* 编辑器标签页标题 */
            .workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title {
                color: transparent;
            }
            .workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title::before {
                content: "${escapedName}";
            }
            
            /* 文件标题栏 */
            .view-header[data-path="${escapedPath}"] .view-header-title {
                color: transparent;
            }
            .view-header[data-path="${escapedPath}"] .view-header-title::before {
                content: "${escapedName}";
            }
            
            /* 搜索结果和其他位置 */
            .tree-item[data-path="${escapedPath}"] .tree-item-inner {
                color: transparent;
            }
            .tree-item[data-path="${escapedPath}"] .tree-item-inner::before {
                content: "${escapedName}";
            }
        `;
    }
    
    /**
     * 更新样式表
     */
    public updateStyleSheet(rules: Map<string, string>): void {
        try {
            // 检查是否有变化
            let hasChanges = false;
            
            // 检查新规则和删除的规则
            rules.forEach((rule, path) => {
                if (this.cssRulesCache.get(path) !== rule) hasChanges = true;
            });
            this.cssRulesCache.forEach((_, path) => {
                if (!rules.has(path)) hasChanges = true;
            });
            
            if (hasChanges) {
                const cssContent = Array.from(rules.values()).join('\n');
                if (this.styleEl) {
                    this.styleEl.textContent = cssContent;
                }
                this.cssRulesCache = new Map(rules);
            }
        } catch (error) {
            console.error('更新样式表失败:', error);
        }
    }
    
    /**
     * 清除样式表
     */
    public clearStyleSheet(): void {
        if (this.styleEl) {
            this.styleEl.textContent = '';
            this.cssRulesCache.clear();
        }
    }
    
    /**
     * 创建样式元素
     */
    private createStyleElement(): void {
        if (!this.styleEl) {
            this.styleEl = document.createElement('style');
            document.head.appendChild(this.styleEl);
        }
    }
    
    /**
     * 销毁样式元素
     */
    public destroy(): void {
        if (this.styleEl) {
            this.styleEl.remove();
            this.styleEl = null;
        }
        this.cssRulesCache.clear();
        this.nameMapping.clear();
    }
    
    /**
     * 更新名称映射
     */
    public updateNameMapping(originalName: string, displayName: string): void {
        this.nameMapping.set(displayName, originalName);
        this.nameMapping.set(originalName, originalName); // 自身映射，保证查找时能找到
    }
    
    /**
     * 查找原始文件名
     */
    public findOriginalFileName(displayName: string): string | null {
        return this.nameMapping.get(displayName) || null;
    }
    
    /**
     * 清空名称映射
     */
    public clearNameMapping(): void {
        this.nameMapping.clear();
    }
    
    /**
     * 获取名称映射大小
     */
    public getNameMappingSize(): number {
        return this.nameMapping.size;
    }
    
    /**
     * 处理markdown中的链接
     */
    public processMarkdownLinks(el: HTMLElement): void {
        try {
            const links = Array.from(el.querySelectorAll('a.internal-link'));
            for (const link of links) {
                try {
                    const originalName = link.getAttribute('data-href');
                    if (!originalName) continue;
                    
                    const newName = this.getUpdatedFileName(originalName);
                    if (newName) {
                        link.textContent = newName;
                    }
                } catch (error) {
                    console.error(`处理链接失败: ${link.getAttribute('data-href')}`, error);
                    // 继续处理其他链接
                }
            }
        } catch (error) {
            console.error('处理Markdown链接失败:', error);
        }
    }
}  
