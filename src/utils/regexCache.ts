import { Cache } from './cache';

/**
 * 正则表达式缓存管理器
 * 用于缓存和复用正则表达式对象
 */

interface RegexCacheStats {
    hits: number;
    misses: number;
    patterns: Map<string, number>;  // 模式使用次数统计
}

export class RegexCache {
    private static instance: RegexCache;
    private cache: Cache<RegExp>;
    private stats: RegexCacheStats;
    private readonly MAX_CACHE_SIZE = 100;  // 最大缓存数量

    private constructor() {
        this.cache = Cache.getInstance<RegExp>('regex', {
            maxSize: 1024 * 1024, // 1MB
            expireTime: 30 * 60 * 1000 // 30分钟
        });
        this.stats = {
            hits: 0,
            misses: 0,
            patterns: new Map()
        };
    }

    /**
     * 获取单例实例
     */
    public static getInstance(): RegexCache {
        if (!RegexCache.instance) {
            RegexCache.instance = new RegexCache();
        }
        return RegexCache.instance;
    }

    /**
     * 获取或创建正则表达式对象
     * @param pattern 正则表达式模式
     * @param flags 正则表达式标志
     * @returns RegExp对象
     */
    public get(pattern: string, flags?: string): RegExp {
        const key = flags ? `${pattern}:${flags}` : pattern;
        
        let regex = this.cache.get(key);
        if (!regex) {
            regex = new RegExp(pattern, flags);
            this.cache.set(key, regex);
        }
        
        return regex;
    }

    /**
     * 清理缓存
     */
    public clear(): void {
        this.cache.clear();
        this.stats.patterns.clear();
        this.stats.hits = 0;
        this.stats.misses = 0;
    }

    /**
     * 获取缓存统计信息
     */
    public getStats(): any {
        return this.cache.getStats();
    }
} 