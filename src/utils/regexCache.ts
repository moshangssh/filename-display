/**
 * 正则表达式缓存管理器
 * 用于缓存和复用正则表达式对象
 */

export class RegexCache {
    private static instance: RegexCache;
    private cache: Map<string, RegExp>;
    private readonly MAX_CACHE_SIZE = 100;  // 最大缓存数量

    private constructor() {
        this.cache = new Map();
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
            
            // 如果缓存已满,删除最早的项
            if (this.cache.size >= this.MAX_CACHE_SIZE) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            
            this.cache.set(key, regex);
        }
        
        return regex;
    }

    /**
     * 清理缓存
     */
    public clear(): void {
        this.cache.clear();
    }
} 