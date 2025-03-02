/**
 * 正则表达式缓存管理器
 * 用于缓存和复用正则表达式对象
 */

import { DBService } from "../services/dbService";
import { log } from "./helpers";
import { DEFAULT_SETTINGS, FileDisplayPluginSettings } from "../types";

export class RegexCache {
    private static instance: RegexCache;
    private cache: Map<string, RegExp>;
    private dbService: DBService;
    private settings: FileDisplayPluginSettings;
    private isInitialized = false;

    private constructor() {
        this.cache = new Map();
        this.dbService = DBService.getInstance();
        this.settings = { ...DEFAULT_SETTINGS };
        this.initAsync();
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
     * 设置配置信息
     * @param settings 插件设置
     */
    public updateSettings(settings: FileDisplayPluginSettings): void {
        this.settings = { ...settings };
    }

    /**
     * 异步初始化
     */
    private async initAsync(): Promise<void> {
        try {
            // 初始化数据库服务
            await this.dbService.init();
            
            // 如果未启用正则缓存，则不预加载
            if (!this.settings.enableRegexCaching) {
                this.isInitialized = true;
                return;
            }
            
            // 从数据库加载最常用的正则表达式
            const patterns = await this.dbService.getMostUsedPatterns(this.settings.maxRegexCacheSize);
            
            // 预编译并缓存
            for (const pattern of patterns) {
                try {
                    const regex = new RegExp(pattern.pattern, pattern.flags);
                    const key = pattern.flags ? `${pattern.pattern}:${pattern.flags}` : pattern.pattern;
                    this.cache.set(key, regex);
                } catch (error) {
                    log(`预编译正则表达式失败: ${pattern.pattern}`, error, true);
                }
            }
            
            this.isInitialized = true;
            log(`预编译了 ${patterns.length} 个常用正则表达式模式`);
        } catch (error) {
            log('初始化正则表达式缓存失败', error, true);
        }
    }

    /**
     * 获取或创建正则表达式对象
     * @param pattern 正则表达式模式
     * @param flags 正则表达式标志
     * @returns RegExp对象
     */
    public get(pattern: string, flags?: string): RegExp {
        const key = flags ? `${pattern}:${flags}` : pattern;
        
        // 首先检查内存缓存
        let regex = this.cache.get(key);
        if (regex) {
            // 如果启用了缓存，异步更新使用统计
            if (this.settings.enableRegexCaching) {
                this.updateUsageStatsAsync(pattern, flags);
            }
            return regex;
        }
        
        try {
            // 创建新的正则表达式
            regex = new RegExp(pattern, flags);
            
            // 如果缓存已满，删除最早的项
            if (this.cache.size >= this.settings.maxRegexCacheSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            
            // 添加到内存缓存
            this.cache.set(key, regex);
            
            // 如果启用了缓存，异步存储到数据库
            if (this.settings.enableRegexCaching) {
                this.storePatternAsync(pattern, flags);
            }
            
            return regex;
        } catch (error) {
            log(`创建正则表达式失败: ${pattern}`, error, true);
            // 返回一个不会匹配任何内容的正则表达式作为后备
            return new RegExp("^\0$");
        }
    }

    /**
     * 异步存储正则表达式模式到数据库
     */
    private async storePatternAsync(pattern: string, flags?: string): Promise<void> {
        try {
            await this.dbService.storeRegexPattern(pattern, flags);
        } catch (error) {
            log('存储正则表达式模式失败', error, true);
        }
    }
    
    /**
     * 异步更新使用统计
     */
    private async updateUsageStatsAsync(pattern: string, flags?: string): Promise<void> {
        try {
            await this.dbService.storeRegexPattern(pattern, flags);
        } catch (error) {
            // 静默失败，这只是统计更新
        }
    }

    /**
     * 清理缓存
     */
    public clear(): void {
        this.cache.clear();
        // 异步清理数据库
        this.clearDatabaseAsync();
    }
    
    /**
     * 异步清理数据库
     */
    private async clearDatabaseAsync(): Promise<void> {
        try {
            await this.dbService.clear();
        } catch (error) {
            log('清理数据库失败', error, true);
        }
    }
    
    /**
     * 测试正则表达式是否有效
     * @param pattern 正则表达式模式
     * @param flags 正则表达式标志
     * @returns 是否有效
     */
    public isValidRegex(pattern: string, flags?: string): boolean {
        try {
            new RegExp(pattern, flags);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * 获取缓存统计信息
     */
    public async getStats(): Promise<{ 
        memoryCacheSize: number, 
        isInitialized: boolean, 
        cacheEnabled: boolean,
        maxCacheSize: number,
        mostUsedPatterns: Array<{ pattern: string, flags: string, useCount: number }> 
    }> {
        const mostUsedPatterns = await this.dbService.getMostUsedPatterns(10);
        
        return {
            memoryCacheSize: this.cache.size,
            isInitialized: this.isInitialized,
            cacheEnabled: this.settings.enableRegexCaching,
            maxCacheSize: this.settings.maxRegexCacheSize,
            mostUsedPatterns
        };
    }
} 