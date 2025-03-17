import { TFile, TAbstractFile } from 'obsidian';
import type { ITitleExtractorPlugin } from '../types';
import { IEventManagerService, ILoggerService } from './interfaces/IServices';
import { EventBus } from '../utils/EventBus';

// 定义事件类型
export enum FileEventType {
    CREATE = 'file_create',
    MODIFY = 'file_modify',
    RENAME = 'file_rename',
    DELETE = 'file_delete',
    METADATA = 'file_metadata',
    DISPLAY_UPDATE = 'display_update',
    EXPLORER_REFRESH = 'explorer_refresh',
    UPDATE_ALL = 'update_all_files'
}

// 定义事件接口
export interface FileEvent {
    type: FileEventType;
    file: TFile | null;
    oldPath?: string;
    data?: any;
    source?: string;
}

// 定义订阅者回调函数类型
export type EventCallback = (event: FileEvent) => Promise<void> | void;

export class EventManagerService implements IEventManagerService {
    private plugin: ITitleExtractorPlugin;
    private eventHandlers: Map<string, any[]> = new Map();
    private logger: ILoggerService;
    private eventBus: EventBus<FileEventType>;
    
    constructor(plugin: ITitleExtractorPlugin, loggerService: ILoggerService) {
        this.plugin = plugin;
        this.logger = loggerService.getLogger('EventManagerService');
        
        // 初始化事件总线
        this.eventBus = new EventBus<FileEventType>({
            loggerService,
            batchSize: 5,
            batchDelay: 100,
            maxQueueSize: 100,
            duplicateFilterMs: 500
        });
        
        this.logger.info('EventManagerService 初始化完成');
    }
    
    // 订阅事件
    public subscribe(eventType: FileEventType, callback: EventCallback): () => void {
        this.logger.log(`订阅事件：${eventType}`);
        
        // 使用事件总线注册事件处理器
        return this.eventBus.on(eventType, (data: any) => {
            // 调用回调函数处理事件
            return callback(data);
        });
    }
    
    // 取消订阅事件
    public unsubscribe(eventType: FileEventType, callback: EventCallback): void {
        this.logger.log(`取消订阅事件：${eventType}`);
        
        // 使用事件总线取消注册事件处理器
        this.eventBus.off(eventType, callback);
    }
    
    // 分发事件
    public async dispatch(event: FileEvent): Promise<void> {
        try {
            const filePath = event.file ? event.file.path : 'no-file';
            this.logger.log(`分发事件: ${event.type} - 文件: ${filePath}`);
            
            // 计算事件优先级
            const priority = this.calculatePriority(event);
            
            // 使用事件总线发送事件
            this.eventBus.emit(event.type, event, priority);
        } catch (error) {
            this.logger.error(`分发事件 ${event.type} 时发生致命错误`, error);
        }
    }
    
    /**
     * 计算事件优先级
     */
    private calculatePriority(event: FileEvent): number {
        let priority = 1;

        // 文件创建和删除事件优先级最高
        if (event.type === FileEventType.CREATE || event.type === FileEventType.DELETE) {
            priority += 3;
        }
        // 重命名事件次之
        else if (event.type === FileEventType.RENAME) {
            priority += 2;
        }
        // 修改事件优先级最低
        else if (event.type === FileEventType.MODIFY) {
            priority += 1;
        }

        return priority;
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
        
        const metadataHandler = this.plugin.registerEvent(
            this.plugin.app.metadataCache.on('changed', (file: TFile) => {
                this.dispatch({
                    type: FileEventType.METADATA,
                    file: file
                }).catch(err => {
                    this.logger.error('处理元数据变更事件时出错:', err);
                });
            })
        );
        
        this.addEventHandler('metadata', metadataHandler);
        this.logger.log('元数据事件监听器设置完成');
    }
    
    // 添加事件处理器到集合
    private addEventHandler(source: string, handler: any): void {
        if (!this.eventHandlers.has(source)) {
            this.eventHandlers.set(source, []);
        }
        this.eventHandlers.get(source)?.push(handler);
    }
    
    // 清理所有资源
    public dispose(): void {
        this.logger.log('正在清理事件管理器资源...');
        
        // 清理事件总线
        this.eventBus.clear();
        
        // 清理所有事件处理器
        this.eventHandlers.forEach(handlers => {
            handlers.forEach(handler => {
                if (typeof handler.unregister === 'function') {
                    handler.unregister();
                }
            });
        });
        this.eventHandlers.clear();
        
        this.logger.log('事件管理器资源已清理');
    }
} 