import { RegexCache } from '../utils/regexCache';

/**
 * 文件名转换配置接口
 */
export interface NameTransformerConfig {
    fileNamePattern: string;
    captureGroup: number;
}

/**
 * 文件名转换器
 * 专注于文件名转换逻辑，包含正则匹配和处理
 */
export class NameTransformer {
    private config: NameTransformerConfig;
    private regexCache: RegexCache;
    
    constructor(config: NameTransformerConfig) {
        this.config = { ...config };
        this.regexCache = RegexCache.getInstance();
    }
    
    /**
     * 更新配置
     */
    public updateConfig(config: Partial<NameTransformerConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 根据配置的规则转换文件名
     */
    public transformFileName(originalName: string): string | null {
        try {
            // 创建正则表达式
            const pattern = this.config.fileNamePattern;
            if (!pattern || pattern.trim() === '') {
                return null;
            }
            
            // 使用正则缓存获取正则对象
            const regex = this.regexCache.get(pattern, 'g');
            
            // 执行匹配
            const match = regex.exec(originalName);
            if (!match) {
                return this.getFallbackName(originalName);
            }
            
            // 获取捕获组
            const captureGroup = this.config.captureGroup;
            
            // 确保捕获组索引有效
            if (captureGroup < 0 || captureGroup >= match.length) {
                return this.getFallbackName(originalName);
            }
            
            // 返回转换后的文件名
            return match[captureGroup] || this.getFallbackName(originalName);
        } catch (error) {
            console.error('文件名转换失败:', error);
            return this.getFallbackName(originalName);
        }
    }
    
    /**
     * 获取回退名称
     */
    private getFallbackName(originalName: string): string {
        // 简单地移除文件扩展名作为回退
        const lastDotIndex = originalName.lastIndexOf('.');
        if (lastDotIndex > 0) {
            return originalName.substring(0, lastDotIndex);
        }
        return originalName;
    }
    
    /**
     * 验证模式是否有效
     */
    public isValidPattern(pattern: string): boolean {
        return this.regexCache.isValidRegex(pattern);
    }
} 