import { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { ITitleExtractorPlugin } from '../types';
import { Logger } from '../utils/logger';
import { 
    createLinkDecorationExtension,
    createEditorExtensions,
    createLinkObserverExtension
} from '../extensions';

// 创建服务特定的日志记录器
const logger = new Logger('LinkDecorationExtensionProvider');

/**
 * 编辑器视图更新回调函数类型
 */
export type EditorViewChangeCallback = (view: EditorView) => void;

/**
 * 装饰扩展提供者接口
 */
export interface ILinkDecorationExtensionProvider {
    /**
     * 创建链接装饰扩展
     */
    createLinkDecorationExtension(changeCallback: EditorViewChangeCallback): Extension;

    /**
     * 创建编辑器扩展集合
     */
    createEditorExtensions(plugin: ITitleExtractorPlugin): Extension;

    /**
     * 创建链接观察者扩展
     */
    createLinkObserverExtension(changeCallback: EditorViewChangeCallback): Extension;
}

/**
 * 负责创建和提供编辑器扩展的类，但不直接处理服务逻辑
 * 该类遵循单一职责原则，只负责创建扩展而不关心如何使用和管理它们
 */
export class LinkDecorationExtensionProvider implements ILinkDecorationExtensionProvider {
    constructor(private plugin: ITitleExtractorPlugin) {
        logger.debug('创建链接装饰扩展提供者');
    }

    /**
     * 创建链接装饰扩展
     * @param changeCallback 编辑器视图变更回调函数
     * @returns 编辑器扩展
     */
    public createLinkDecorationExtension(changeCallback: EditorViewChangeCallback): Extension {
        return createLinkDecorationExtension(this.plugin, changeCallback);
    }

    /**
     * 创建编辑器扩展集合
     * @returns 编辑器扩展集合
     */
    public createEditorExtensions(): Extension {
        return createEditorExtensions(this.plugin);
    }

    /**
     * 创建链接观察者扩展
     * @param changeCallback 编辑器视图变更回调函数
     * @returns 编辑器扩展
     */
    public createLinkObserverExtension(changeCallback: EditorViewChangeCallback): Extension {
        return createLinkObserverExtension(this.plugin, changeCallback);
    }

    /**
     * 创建自定义视图插件
     * @param callback 更新回调函数
     * @returns 编辑器扩展
     */
    public createViewPlugin(callback: (update: ViewUpdate) => void): Extension {
        return ViewPlugin.define<{view: EditorView}>((view) => {
            return {
                view,
                update(update: ViewUpdate) {
                    callback(update);
                }
            };
        });
    }
} 