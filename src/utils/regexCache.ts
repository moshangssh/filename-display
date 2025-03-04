/**
 * 简化版的正则表达式工具类
 */
import { log } from './logger';

export class RegexCache {
    private static instance: RegexCache;

    private constructor() {}

    public static getInstance(): RegexCache {
        if (!RegexCache.instance) {
            RegexCache.instance = new RegexCache();
        }
        return RegexCache.instance;
    }

    /**
     * 获取正则表达式对象
     */
    public get(pattern: string, flags?: string): RegExp {
        try {
            return new RegExp(pattern, flags);
        } catch (error) {
            log(`创建正则表达式失败: ${pattern}`, error, true);
            return new RegExp("^\0$");
        }
    }

    /**
     * 验证正则表达式是否有效
     */
    public isValidRegex(pattern: string, flags?: string): boolean {
        try {
            new RegExp(pattern, flags);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 更新设置（保持接口兼容）
     */
    public updateSettings(): void {
        // 不再需要设置
    }

    /**
     * 清理（保持接口兼容）
     */
    public clear(): void {
        // 不再需要清理
    }

    /**
     * 获取统计信息（保持接口兼容）
     */
    public async getStats(): Promise<any> {
        return {
            memoryCacheSize: 0,
            isInitialized: true,
            cacheEnabled: false,
            maxCacheSize: 0,
            mostUsedPatterns: []
        };
    }
} 