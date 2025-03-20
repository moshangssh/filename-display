import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { LoggerService } from "./LoggerService";
import type { ITitleExtractorPlugin } from '../types';
import { 
    viewportExtension,
    incrementalUpdateExtension,
    editorSyncExtension,
    createLinkDecorationExtension,
    createLinkObserverExtension,
    createEditorExtensions
} from '../extensions';

// 创建服务特定的日志记录器
const logger = new LoggerService('ExtensionCacheService');

/**
 * 扩展类型枚举
 * 用于标识不同类型的扩展
 */
export enum ExtensionType {
    LINK_DECORATION = 'link_decoration',
    EDITOR = 'editor',
    COMBINED = 'combined',
    LINK_OBSERVER = 'link_observer'
}

/**
 * 简化的扩展服务
 * 管理编辑器扩展的创建和组合，不再处理缓存
 */
export class ExtensionCacheService {
    /**
     * 创建扩展服务
     */
    constructor(private plugin: ITitleExtractorPlugin) {
        logger.info('初始化扩展服务');
    }
    
    /**
     * 获取链接装饰扩展
     */
    public getLinkDecorationExtension(onChange: (view: EditorView) => void): Extension {
        logger.debug(`创建链接装饰扩展`);
        return createLinkDecorationExtension(this.plugin, onChange);
    }
    
    /**
     * 获取链接观察者扩展
     */
    public getLinkObserverExtension(onChange: (view: EditorView) => void): Extension {
        logger.debug(`创建链接观察者扩展`);
        return createLinkObserverExtension(this.plugin, onChange);
    }
    
    /**
     * 获取编辑器扩展集合
     */
    public getEditorExtensions(): Extension {
        logger.debug(`创建编辑器扩展`);
        return createEditorExtensions(this.plugin);
    }
    
    /**
     * 获取合并的扩展集合
     */
    public getCombinedExtensions(): Extension {
        logger.debug(`创建合并扩展`);
        
        // 包含所有必要的扩展
        const extension = [
            // 基础扩展
            viewportExtension(),
            incrementalUpdateExtension(),
            editorSyncExtension(this.plugin),
            
            // 功能扩展
            this.getEditorExtensions()
        ];
        
        logger.debug(`合并扩展已创建，包含 ${extension.length} 个组件`);
        return extension;
    }
    
    /**
     * 清除缓存资源的方法
     * 仅保留为了接口兼容性
     */
    public clearCache(): void {
        logger.debug('清除扩展缓存 (空操作)');
        // 不再需要缓存清理
    }
    
    /**
     * 释放资源
     */
    public dispose(): void {
        logger.debug('释放扩展服务资源');
        // 不再需要资源释放
    }
} 