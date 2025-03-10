import { TFile, TAbstractFile } from 'obsidian';
import type { ITitleExtractorPlugin } from '../types';
import { IEventManagerService, ILoggerService } from './interfaces/IServices';

// 定义事件类型
export enum FileEventType {
    CREATE = 'file_create',
    MODIFY = 'file_modify',
    RENAME = 'file_rename',
    DELETE = 'file_delete',
    METADATA = 'file_metadata',
    DISPLAY_UPDATE = 'display_update',
    EXPLORER_REFRESH = 'explorer_refresh'
}

// 定义事件接口
export interface FileEvent {
    type: FileEventType;
    file: TFile;
    oldPath?: string;
    data?: any;
}

// 定义订阅者回调函数类型
export type EventCallback = (event: FileEvent) => Promise<void> | void;

export class EventManagerService implements IEventManagerService {
    private plugin: ITitleExtractorPlugin;
    private eventSubscribers: Map<FileEventType, Set<EventCallback>> = new Map();
    private eventHandlers: Map<string, any[]> = new Map();
    private logger: ILoggerService;
    
    constructor(plugin: ITitleExtractorPlugin, loggerService: ILoggerService) {
        this.plugin = plugin;
        this.logger = loggerService.getLogger('EventManagerService');
        
        // 初始化事件类型映射
        Object.values(FileEventType).forEach(type => {
            this.eventSubscribers.set(type as FileEventType, new Set());
        });
        
        this.logger.info('EventManagerService 初始化完成');
    }
    
    // 订阅事件
    public subscribe(eventType: FileEventType, callback: EventCallback): () => void {
        this.logger.log(`订阅事件：${eventType}`);
        const callbacks = this.eventSubscribers.get(eventType);
        if (!callbacks) {
            throw new Error(`未知的事件类型: ${eventType}`);
        }
        
        callbacks.add(callback);
        
        // 返回取消订阅函数
        return () => {
            this.unsubscribe(eventType, callback);
        };
    }
    
    // 取消订阅
    public unsubscribe(eventType: FileEventType, callback: EventCallback): void {
        this.logger.log(`取消订阅事件：${eventType}`);
        const callbacks = this.eventSubscribers.get(eventType);
        if (callbacks) {
            callbacks.delete(callback);
        }
    }
    
    // 分发事件
    public async dispatch(event: FileEvent): Promise<void> {
        this.logger.log(`分发事件: ${event.type} - 文件: ${event.file.path}`);
        const callbacks = this.eventSubscribers.get(event.type);
        
        if (!callbacks || callbacks.size === 0) {
            this.logger.log(`没有订阅者处理事件: ${event.type}`);
            return;
        }
        
        this.logger.log(`找到 ${callbacks.size} 个订阅者处理事件: ${event.type}`);
        
        // 并行执行所有回调，但捕获潜在错误
        const promises = Array.from(callbacks).map(async (callback) => {
            try {
                const result = callback(event);
                if (result instanceof Promise) {
                    await result;
                }
            } catch (error) {
                this.logger.error(`处理事件 ${event.type} 时发生错误:`, error);
            }
        });
        
        await Promise.all(promises);
    }
    
    // 设置 Vault 事件监听器
    public setupVaultEventListeners(): void {
        this.logger.log('设置 Vault 事件监听器');
        
        // 监听文件创建事件
        const createHandler = this.plugin.registerEvent(
            this.plugin.app.vault.on('create', (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    this.dispatch({
                        type: FileEventType.CREATE,
                        file: file
                    }).catch(err => {
                        this.logger.error('处理文件创建事件时出错:', err);
                    });
                }
            })
        );
        this.addEventHandler('vault', createHandler);

        // 监听文件修改事件
        const modifyHandler = this.plugin.registerEvent(
            this.plugin.app.vault.on('modify', (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    this.dispatch({
                        type: FileEventType.MODIFY,
                        file: file
                    }).catch(err => {
                        this.logger.error('处理文件修改事件时出错:', err);
                    });
                }
            })
        );
        this.addEventHandler('vault', modifyHandler);

        // 监听文件重命名事件
        const renameHandler = this.plugin.registerEvent(
            this.plugin.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
                if (file instanceof TFile) {
                    this.dispatch({
                        type: FileEventType.RENAME,
                        file: file,
                        oldPath: oldPath
                    }).catch(err => {
                        this.logger.error('处理文件重命名事件时出错:', err);
                    });
                }
            })
        );
        this.addEventHandler('vault', renameHandler);

        // 监听文件删除事件
        const deleteHandler = this.plugin.registerEvent(
            this.plugin.app.vault.on('delete', (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    this.dispatch({
                        type: FileEventType.DELETE,
                        file: file
                    }).catch(err => {
                        this.logger.error('处理文件删除事件时出错:', err);
                    });
                }
            })
        );
        this.addEventHandler('vault', deleteHandler);
        
        this.logger.log('Vault 事件监听器设置完成');
    }
    
    // 设置元数据事件监听器
    public setupMetadataEventListeners(): void {
        this.logger.log('设置元数据事件监听器');
        
        // 监听元数据缓存变更
        const metadataHandler = this.plugin.registerEvent(
            this.plugin.app.metadataCache.on('changed', (file: TFile) => {
                if (file instanceof TFile) {
                    // 检查是否需要更新显示
                    const metadata = this.plugin.app.metadataCache.getFileCache(file);
                    if (metadata?.frontmatter && 'title' in metadata.frontmatter) {
                        this.dispatch({
                            type: FileEventType.METADATA,
                            file: file,
                            data: { frontmatter: metadata.frontmatter }
                        }).catch(err => {
                            this.logger.error('处理元数据变更事件时出错:', err);
                        });
                    }
                }
            })
        );
        this.addEventHandler('metadata', metadataHandler);
        
        this.logger.log('元数据事件监听器设置完成');
    }
    
    // 添加事件处理器到集合
    private addEventHandler(type: string, handler: any): void {
        if (!this.eventHandlers.has(type)) {
            this.eventHandlers.set(type, []);
        }
        
        this.eventHandlers.get(type)?.push(handler);
    }
    
    // 清理所有注册的事件
    public dispose(): void {
        this.logger.log('正在清理事件管理器资源...');
        
        // 清理所有注册的事件处理器
        this.eventHandlers.forEach(handlers => {
            handlers.forEach(handler => {
                // 只有当 handler 是函数时才调用
                if (typeof handler === 'function') {
                    handler();
                }
            });
        });
        
        // 清空事件处理器集合
        this.eventHandlers.clear();
        this.eventSubscribers.clear();
        
        this.logger.log('事件管理器资源已清理');
    }
} 