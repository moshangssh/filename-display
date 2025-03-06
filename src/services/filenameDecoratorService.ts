import { App, Plugin } from 'obsidian';
import { NameTransformer, NameTransformerConfig } from './nameTransformer';
import { FileExplorerDecorator, EditorDecorator, UIDecoratorConfig } from './uiDecoratorService';

/**
 * 文件名装饰插件配置接口
 */
export interface FilenameDecoratorConfig extends NameTransformerConfig, UIDecoratorConfig {
    enabled: boolean;
}

/**
 * 文件名装饰服务
 * 整合所有组件的主服务
 */
export class FilenameDecoratorService {
    private app: App;
    private plugin: Plugin;
    private config: FilenameDecoratorConfig;
    
    // 组件实例
    private nameTransformer: NameTransformer;
    private fileExplorerDecorator: FileExplorerDecorator;
    private editorDecorator: EditorDecorator;
    
    constructor(app: App, plugin: Plugin, config: FilenameDecoratorConfig) {
        this.app = app;
        this.plugin = plugin;
        this.config = { ...config };
        
        // 创建名称转换器
        this.nameTransformer = new NameTransformer({
            fileNamePattern: this.config.fileNamePattern,
            captureGroup: this.config.captureGroup
        });
        
        // 创建UI装饰器
        this.fileExplorerDecorator = new FileExplorerDecorator(
            this.app, 
            { showOriginalNameOnHover: this.config.showOriginalNameOnHover },
            this.nameTransformer
        );
        
        this.editorDecorator = new EditorDecorator(
            this.app,
            { showOriginalNameOnHover: this.config.showOriginalNameOnHover },
            this.nameTransformer
        );
        
        // 注册编辑器扩展
        this.registerEditorExtension();
    }
    
    /**
     * 注册编辑器扩展
     */
    private registerEditorExtension(): void {
        // 获取编辑器视图插件
        const viewPlugin = this.editorDecorator.createEditorViewPlugin();
        
        // 注册到Obsidian
        this.plugin.registerEditorExtension([viewPlugin]);
    }
    
    /**
     * 更新配置
     */
    public updateConfig(config: Partial<FilenameDecoratorConfig>): void {
        // 更新主配置
        this.config = { ...this.config, ...config };
        
        // 更新名称转换器配置
        this.nameTransformer.updateConfig({
            fileNamePattern: this.config.fileNamePattern,
            captureGroup: this.config.captureGroup
        });
        
        // 更新UI装饰器配置
        const uiConfig = { showOriginalNameOnHover: this.config.showOriginalNameOnHover };
        this.fileExplorerDecorator.updateConfig(uiConfig);
        this.editorDecorator.updateConfig(uiConfig);
        
        // 应用更新后的装饰
        this.applyDecorations();
    }
    
    /**
     * 应用文件名装饰
     */
    public applyDecorations(): void {
        if (!this.config.enabled) {
            this.clearDecorations();
            return;
        }
        
        // 应用文件资源管理器装饰
        this.fileExplorerDecorator.applyDecorations();
        
        // 应用编辑器装饰
        this.editorDecorator.applyDecorations();
    }
    
    /**
     * 清除所有装饰
     */
    public clearDecorations(): void {
        this.fileExplorerDecorator.clearDecorations();
        this.editorDecorator.clearDecorations();
    }
    
    /**
     * 销毁服务
     */
    public destroy(): void {
        // 清除所有装饰
        this.clearDecorations();
        
        // 销毁装饰器
        this.fileExplorerDecorator.destroy();
        this.editorDecorator.destroy();
    }
} 