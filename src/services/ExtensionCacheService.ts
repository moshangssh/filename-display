import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Logger } from '../utils/logger';
import type { ITitleExtractorPlugin } from '../types';
import { 
    createLinkDecorationExtension, 
    createEditorExtensions
} from '../extensions/editor';

// 创建服务特定的日志记录器
const logger = new Logger('ExtensionCacheService');

/**
 * 扩展类型枚举
 * 用于标识不同类型的扩展以便缓存
 */
export enum ExtensionType {
    LINK_DECORATION = 'link_decoration',
    EDITOR = 'editor',
    COMBINED = 'combined'
}

/**
 * CodeMirror扩展缓存服务
 * 负责缓存和管理CodeMirror扩展，避免重复创建
 */
export class ExtensionCacheService {
    // 扩展缓存
    private extensionCache: Map<string, Extension> = new Map();
    // 扩展创建函数映射
    private extensionCreators: Map<string, (...args: any[]) => Extension> = new Map();
    // 编辑器实例到扩展的映射，用于按需加载
    private editorInstanceExtensions: WeakMap<EditorView, Set<string>> = new WeakMap();
    
    constructor(private plugin: ITitleExtractorPlugin) {
        // 注册扩展创建函数
        this.registerExtensionCreators();
        
        logger.log('扩展缓存服务已初始化');
    }
    
    /**
     * 注册各种扩展的创建函数
     */
    private registerExtensionCreators(): void {
        // 注册链接装饰扩展创建函数
        this.extensionCreators.set(
            ExtensionType.LINK_DECORATION,
            (onChange: (view: EditorView) => void) => createLinkDecorationExtension(this.plugin, onChange)
        );
        
        // 注册编辑器扩展创建函数
        this.extensionCreators.set(
            ExtensionType.EDITOR,
            () => createEditorExtensions(this.plugin)
        );
    }
    
    /**
     * 获取指定类型的扩展
     * 如果缓存中存在，则返回缓存的扩展
     * 否则创建新的扩展并缓存
     */
    public getExtension(type: string, key: string = 'default', ...args: any[]): Extension {
        const cacheKey = `${type}:${key}`;
        
        // 检查缓存
        if (this.extensionCache.has(cacheKey)) {
            logger.debug(`从缓存返回扩展: ${cacheKey}`);
            return this.extensionCache.get(cacheKey)!;
        }
        
        // 检查是否有对应类型的创建函数
        if (!this.extensionCreators.has(type)) {
            logger.error(`未知的扩展类型: ${type}`);
            throw new Error(`未知的扩展类型: ${type}`);
        }
        
        // 创建新的扩展
        logger.debug(`创建新扩展: ${cacheKey}`);
        const extension = this.extensionCreators.get(type)!(...args);
        
        // 缓存扩展
        this.extensionCache.set(cacheKey, extension);
        
        return extension;
    }
    
    /**
     * 获取链接装饰扩展
     */
    public getLinkDecorationExtension(onChange: (view: EditorView) => void): Extension {
        return this.getExtension(ExtensionType.LINK_DECORATION, 'default', onChange);
    }
    
    /**
     * 获取编辑器扩展
     */
    public getEditorExtension(): Extension {
        return this.getExtension(ExtensionType.EDITOR);
    }
    
    /**
     * 获取组合扩展
     * 将多个扩展组合为一个
     */
    public getCombinedExtensions(): Extension {
        const cacheKey = `${ExtensionType.COMBINED}:default`;
        
        // 检查缓存
        if (this.extensionCache.has(cacheKey)) {
            logger.debug(`从缓存返回组合扩展`);
            return this.extensionCache.get(cacheKey)!;
        }
        
        // 创建新的组合扩展
        logger.debug(`创建新的组合扩展`);
        
        // 收集所有需要的扩展
        const extensions: Extension[] = [];
        
        // 添加链接装饰扩展
        if (this.plugin.settings.enableEditorLinkDecorations) {
            extensions.push(this.getLinkDecorationExtension((view) => {
                // 当编辑器内容变化时，通知装饰器
                if (this.plugin._linkDecorator) {
                    this.plugin._linkDecorator.onEditorChange?.(view);
                }
            }));
        }
        
        // 添加编辑器扩展
        extensions.push(this.getEditorExtension());
        
        // 如果后续有其他类型的扩展，可以在这里添加
        
        // 缓存并返回组合扩展
        const combinedExtension = extensions;
        this.extensionCache.set(cacheKey, combinedExtension);
        
        return combinedExtension;
    }
    
    /**
     * 为编辑器实例注册扩展
     * 这支持按需加载机制，只在编辑器实例创建时添加扩展
     */
    public registerEditorExtensions(view: EditorView, extensionTypes: string[]): void {
        // 确保编辑器实例有对应的扩展集合
        if (!this.editorInstanceExtensions.has(view)) {
            this.editorInstanceExtensions.set(view, new Set());
        }
        
        const extensionsSet = this.editorInstanceExtensions.get(view)!;
        
        // 对于每个需要添加的扩展类型
        for (const type of extensionTypes) {
            // 如果已经添加过，跳过
            if (extensionsSet.has(type)) {
                continue;
            }
            
            // 添加扩展
            extensionsSet.add(type);
            
            logger.debug(`为编辑器实例添加扩展: ${type}`);
        }
    }
    
    /**
     * 清除所有缓存
     */
    public clearCache(): void {
        this.extensionCache.clear();
        logger.log('扩展缓存已清除');
    }
    
    /**
     * 清除指定类型的缓存
     */
    public clearCacheByType(type: string): void {
        for (const key of this.extensionCache.keys()) {
            if (key.startsWith(`${type}:`)) {
                this.extensionCache.delete(key);
            }
        }
        logger.log(`类型为 ${type} 的扩展缓存已清除`);
    }
    
    /**
     * 释放资源
     */
    public dispose(): void {
        this.extensionCache.clear();
        this.extensionCreators.clear();
        
        // WeakMap会自动清理，不需要手动清理
        logger.log('扩展缓存服务已释放所有资源');
    }
} 