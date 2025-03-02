import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { EventStreamService, FileEventType, FileEvent } from './eventStreamService';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * 文件管理器配置接口
 */
export interface FileManagerConfig {
    activeFolder: string;     // 激活的文件夹路径
}

/**
 * 文件管理器类
 * 负责文件的检索和处理
 */
export class FileManager {
    private eventStreamService: EventStreamService;
    private subscription: any;

    constructor(
        private app: App,
        private config: FileManagerConfig
    ) {
        // 初始化事件流服务
        this.eventStreamService = new EventStreamService({
            throttleTimeMs: 300,  // 节流时间
            debounceTimeMs: 500   // 去抖时间
        });
        
        // 监听文件变更事件并转发到事件流
        this.app.vault.on('modify', (file) => {
            this.eventStreamService.emitModify(file);
        });
        
        this.app.vault.on('create', (file) => {
            this.eventStreamService.emitCreate(file);
        });
        
        this.app.vault.on('delete', (file) => {
            this.eventStreamService.emitDelete(file);
        });
        
        this.app.vault.on('rename', (file, oldPath) => {
            this.eventStreamService.emitRename(file, oldPath);
        });
        
        // 为了保持向后兼容，在每次处理完事件后通知传统监听器
        this.subscription = this.eventStreamService.getCombinedStream()
            .pipe(
                tap((event: FileEvent) => {
                    // 输出调试信息
                    console.log(`[文件事件流] 类型: ${event.type}, 文件: ${event.file.path}`);
                })
            )
            .subscribe(() => {
                // 事件流已经可以被直接订阅，不需要额外通知
            });
    }

    /**
     * 获取文件事件流
     * 允许直接订阅经过节流和去重的事件
     */
    public getFileEventStream(): Observable<FileEvent> {
        return this.eventStreamService.getCombinedStream();
    }
    
    /**
     * 获取指定文件夹下的事件流
     */
    public getFolderEventStream(folderPath: string): Observable<FileEvent> {
        return this.eventStreamService.getFolderStream(folderPath);
    }
    
    /**
     * 获取指定文件类型的事件流
     */
    public getFileTypeEventStream(extension: string): Observable<FileEvent> {
        return this.eventStreamService.getFileTypeStream(extension);
    }
    
    /**
     * 更新配置
     */
    public updateConfig(config: Partial<FileManagerConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 获取当前活动文件夹
     */
    public getActiveFolder(): TFolder | null {
        if (!this.config.activeFolder) {
            return null;
        }
        
        const normalizedPath = normalizePath(this.config.activeFolder);
        const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
        
        return folder instanceof TFolder ? folder : null;
    }
    
    /**
     * 获取指定文件夹下的所有 Markdown 文件
     */
    public getFiles(folder: TFolder | null = null): TFile[] {
        const allFiles = this.app.vault.getMarkdownFiles();
        
        if (!folder) {
            return allFiles;
        }
        
        return allFiles.filter(file => 
            file.path.startsWith(folder.path + '/'));
    }
    
    /**
     * 通过文件名查找文件
     */
    public findFileByName(fileName: string): TFile | null {
        const folder = this.getActiveFolder();
        const files = this.getFiles(folder);
        return files.find(file => file.basename === fileName) || null;
    }
    
    /**
     * 打开指定文件
     */
    public async openFile(file: TFile, newLeaf: boolean = true): Promise<void> {
        try {
            const leaf = this.app.workspace.getLeaf(newLeaf);
            await leaf.openFile(file);
        } catch (error) {
            console.error('打开文件失败:', error);
            throw new Error(`无法打开文件: ${file.path}`);
        }
    }
    
    /**
     * 通过文件名打开文件
     */
    public async openFileByName(fileName: string, newLeaf: boolean = true): Promise<void> {
        const file = this.findFileByName(fileName);
        if (file) {
            await this.openFile(file, newLeaf);
            return;
        }
        throw new Error(`未找到文件: ${fileName}`);
    }
    
    /**
     * 销毁服务
     * 清理订阅以避免内存泄漏
     */
    public destroy(): void {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
    }
}  
