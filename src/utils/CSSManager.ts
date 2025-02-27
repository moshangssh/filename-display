import { Cache } from './cache';

interface StyleRule {
    selector: string;
    properties: { [key: string]: string };
}

/**
 * 统一的CSS样式管理器
 */
export class CSSManager {
    private static instance: CSSManager;
    private styleElement: HTMLStyleElement | null = null;
    private styleCache: Cache<string>;

    private constructor() {
        this.styleCache = Cache.getInstance<string>('css', {
            maxSize: 5 * 1024 * 1024, // 5MB
            expireTime: 24 * 60 * 60 * 1000 // 24小时
        });
        this.initStyleElement();
    }

    public static getInstance(): CSSManager {
        if (!CSSManager.instance) {
            CSSManager.instance = new CSSManager();
        }
        return CSSManager.instance;
    }

    private initStyleElement(): void {
        if (!this.styleElement) {
            this.styleElement = document.createElement('style');
            this.styleElement.id = 'dynamic-styles';
            document.head.appendChild(this.styleElement);
        }
    }

    /**
     * 更新样式规则
     */
    public updateRule(selector: string, properties: { [key: string]: string }): void {
        const rule = this.generateRule({ selector, properties });
        this.styleCache.set(selector, rule);
        this.injectStyles();
    }

    /**
     * 批量更新样式规则
     */
    public updateRules(rules: StyleRule[]): void {
        let hasChanges = false;
        
        for (const rule of rules) {
            const ruleString = this.generateRule(rule);
            const existingRule = this.styleCache.get(rule.selector);
            
            if (existingRule !== ruleString) {
                this.styleCache.set(rule.selector, ruleString);
                hasChanges = true;
            }
        }

        if (hasChanges) {
            this.injectStyles();
        }
    }

    /**
     * 移除样式规则
     */
    public removeRule(selector: string): void {
        if (this.styleCache.get(selector)) {
            this.styleCache.delete(selector);
            this.injectStyles();
        }
    }

    /**
     * 生成CSS规则字符串
     */
    private generateRule(rule: StyleRule): string {
        const properties = Object.entries(rule.properties)
            .map(([key, value]) => `${key}: ${value};`)
            .join(' ');
        return `${rule.selector} { ${properties} }`;
    }

    /**
     * 注入所有样式
     */
    private injectStyles(): void {
        if (!this.styleElement) {
            this.initStyleElement();
        }

        // 获取所有缓存的选择器
        const selectors = Object.keys(this.styleCache.getStats().itemCount || {});
        
        // 获取并组合所有有效的样式规则
        const allRules = selectors
            .map(selector => this.styleCache.get(selector))
            .filter((rule): rule is string => rule !== undefined)
            .join('\n');

        if (this.styleElement) {
            this.styleElement.textContent = allRules;
        }
    }

    /**
     * 清理所有样式
     */
    public clearStyles(): void {
        this.styleCache.clear();
        if (this.styleElement) {
            this.styleElement.textContent = '';
        }
    }

    /**
     * 销毁样式管理器
     */
    public destroy(): void {
        this.clearStyles();
        if (this.styleElement) {
            this.styleElement.remove();
            this.styleElement = null;
        }
    }
} 