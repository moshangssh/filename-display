import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Logger } from '../utils/logger';
import type { ITitleExtractorPlugin } from '../types';
import { 
    viewportExtension,
    incrementalUpdateExtension,
    editorSyncExtension
} from '../extensions';
import { 
    LinkDecorationExtensionProvider,
    ILinkDecorationExtensionProvider
} from './LinkDecorationExtensionProvider';

// 创建服务特定的日志记录器
const logger = new Logger('ExtensionCacheService');

/**
 * 扩展类型枚举
 * 用于标识不同类型的扩展以便缓存
 */
export enum ExtensionType {
    LINK_DECORATION = 'link_decoration',
    EDITOR = 'editor',
    COMBINED = 'combined',
    LINK_OBSERVER = 'link_observer'
}

/**
 * 扩展缓存服务
 * 负责创建、缓存和提供编辑器扩展
 */
export class ExtensionCacheService {
    // 扩展缓存
    private extensionCache: Map<string, Extension> = new Map();
    
    // 扩展实例缓存
    private instanceExtensions: Map<string, Extension> = new Map();
    
    // 编辑器实例的扩展
    private editorInstanceExtensions: Map<EditorView, Set<string>> = new Map();
    
    // 扩展提供者
    private linkDecorationProvider: ILinkDecorationExtensionProvider;
    
    /**
     * 创建扩展缓存服务
     */
    constructor(private plugin: ITitleExtractorPlugin) {
        logger.info('初始化扩展缓存服务');
        
        // 创建扩展提供者
        this.linkDecorationProvider = new LinkDecorationExtensionProvider(plugin);
        
        // 注册基础扩展类型
        this.registerExtensionTypes();
    }
    
    /**
     * 注册扩展类型与创建函数
     */
    private registerExtensionTypes(): void {
        logger.debug('注册基础扩展类型');
    }
    
    /**
     * 获取链接装饰扩展
     */
    public getLinkDecorationExtension(onChange: (view: EditorView) => void): Extension {
        const cacheKey = `${ExtensionType.LINK_DECORATION}:default`;
        
        // 检查缓存
        if (this.extensionCache.has(cacheKey)) {
            logger.debug(`从缓存返回链接装饰扩展`);
            return this.extensionCache.get(cacheKey)!;
        }
        
        // 创建新的扩展
        logger.debug(`创建新的链接装饰扩展`);
        const extension = this.linkDecorationProvider.createLinkDecorationExtension(onChange);
        
        // 缓存扩展
        this.extensionCache.set(cacheKey, extension);
        
        return extension;
    }
    
    /**
     * 获取链接观察者扩展
     */
    public getLinkObserverExtension(onChange: (view: EditorView) => void): Extension {
        const cacheKey = `${ExtensionType.LINK_OBSERVER}:default`;
        
        // 检查缓存
        if (this.extensionCache.has(cacheKey)) {
            logger.debug(`从缓存返回链接观察者扩展`);
            return this.extensionCache.get(cacheKey)!;
        }
        
        // 创建新的扩展
        logger.debug(`创建新的链接观察者扩展`);
        const extension = this.linkDecorationProvider.createLinkObserverExtension(onChange);
        
        // 缓存扩展
        this.extensionCache.set(cacheKey, extension);
        
        return extension;
    }
    
    /**
     * 获取编辑器扩展集合
     */
    public getEditorExtensions(): Extension {
        // 直接创建新的扩展，跳过缓存以确保最新更改生效
        logger.debug(`创建新的编辑器扩展`);
        const extension = this.linkDecorationProvider.createEditorExtensions(this.plugin);
        
        // 记录所创建的扩展包含哪些组件
        logger.debug('创建的编辑器扩展包含以下组件:', 
                    Array.isArray(extension) ? `数组(长度:${extension.length})` : '单一扩展');
        
        return extension;
    }
    
    /**
     * 获取合并的扩展集合
     */
    public getCombinedExtensions(): Extension {
        // 直接创建合并扩展，跳过缓存以确保最新更改生效
        logger.debug(`创建新的合并扩展`);
        
        // 确保包含batchProcessField
        const extension = [
            // 基础扩展
            viewportExtension(),
            incrementalUpdateExtension(),
            editorSyncExtension(this.plugin),
            
            // 功能扩展
            this.getEditorExtensions()
        ];
        
        logger.debug(`合并扩展已创建，包含 ${Array.isArray(extension) ? extension.length : 1} 个组件`);
        
        return extension;
    }
    
    /**
     * 为编辑器实例注册扩展
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
        logger.debug('清除扩展缓存');
        this.extensionCache.clear();
        this.instanceExtensions.clear();
    }
    
    /**
     * 释放资源
     */
    public dispose(): void {
        logger.debug('释放扩展缓存服务资源');
        this.clearCache();
        this.editorInstanceExtensions.clear();
    }
} 