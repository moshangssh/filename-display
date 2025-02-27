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
    private cache: Map<string, RegExp>;
    private stats: RegexCacheStats;
    private readonly MAX_CACHE_SIZE = 100;  // 最大缓存数量

    private constructor() {
        this.cache = new Map();
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
        
        // 检查缓存
        let regex = this.cache.get(key);
        if (regex) {
            this.stats.hits++;
            this.updatePatternStats(pattern);
            return regex;
        }

        // 缓存未命中，创建新的正则表达式
        this.stats.misses++;
        regex = new RegExp(pattern, flags);
        
        // 如果缓存已满，清理最少使用的模式
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            this.cleanLeastUsed();
        }
        
        // 添加到缓存
        this.cache.set(key, regex);
        this.updatePatternStats(pattern);
        
        return regex;
    }

    /**
     * 更新模式使用统计
     */
    private updatePatternStats(pattern: string): void {
        const count = this.stats.patterns.get(pattern) || 0;
        this.stats.patterns.set(pattern, count + 1);
    }

    /**
     * 清理最少使用的正则表达式
     */
    private cleanLeastUsed(): void {
        let leastUsedPattern = '';
        let leastUsedCount = Infinity;

        // 找出使用次数最少的模式
        for (const [pattern, count] of this.stats.patterns) {
            if (count < leastUsedCount) {
                leastUsedCount = count;
                leastUsedPattern = pattern;
            }
        }

        // 从缓存中移除
        if (leastUsedPattern) {
            this.cache.delete(leastUsedPattern);
            this.stats.patterns.delete(leastUsedPattern);
        }
    }

    /**
     * 获取缓存统计信息
     */
    public getStats(): RegexCacheStats {
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            patterns: new Map(this.stats.patterns)
        };
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
} 