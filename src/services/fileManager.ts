import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { EventBus, FileEventType, FileEvent } from './eventBus';

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
    private eventBus: EventBus;
    private unsubscribes: Array<() => void> = [];

    constructor(
        private app: App,
        private config: FileManagerConfig
    ) {
        // 初始化事件总线
        this.eventBus = new EventBus({
            throttleTimeMs: 300,
            debounceTimeMs: 500
        });
        
        // 监听文件变更事件
        this.app.vault.on('modify', (file) => {
            if (file instanceof TFile) {
                this.eventBus.emit({
                    type: FileEventType.MODIFY,
                    file
                });
            }
        });
        
        this.app.vault.on('create', (file) => {
            if (file instanceof TFile) {
                this.eventBus.emit({
                    type: FileEventType.CREATE,
                    file
                });
            }
        });
        
        this.app.vault.on('delete', (file) => {
            if (file instanceof TFile) {
                this.eventBus.emit({
                    type: FileEventType.DELETE,
                    file
                });
            }
        });
        
        this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile) {
                this.eventBus.emit({
                    type: FileEventType.RENAME,
                    file,
                    oldPath
                });
            }
        });
    }

    /**
     * 注册文件事件监听器
     */
    public onFileEvent(type: FileEventType, callback: (event: FileEvent) => void): () => void {
        const unsubscribe = this.eventBus.on(type, callback);
        this.unsubscribes.push(unsubscribe);
        return unsubscribe;
    }
    
    /**
     * 获取指定文件夹的事件监听器
     */
    public onFolderEvents(folderPath: string, callback: (event: FileEvent) => void): () => void {
        // 创建一个过滤器包装回调，只处理特定文件夹中的文件
        const folderCallback = (event: FileEvent) => {
            if (event.file.path.startsWith(folderPath)) {
                callback(event);
            }
        };

        // 为所有事件类型注册监听器
        const unsubscribes = [
            this.onFileEvent(FileEventType.CREATE, folderCallback),
            this.onFileEvent(FileEventType.MODIFY, folderCallback),
            this.onFileEvent(FileEventType.DELETE, folderCallback),
            this.onFileEvent(FileEventType.RENAME, folderCallback)
        ];
        
        // 返回一个清理函数
        return () => unsubscribes.forEach(unsub => unsub());
    }
    
    /**
     * 获取指定文件类型的事件监听器
     */
    public onFileTypeEvents(extension: string, callback: (event: FileEvent) => void): () => void {
        // 创建一个过滤器包装回调，只处理特定扩展名的文件
        const typeCallback = (event: FileEvent) => {
            if (event.file.path.endsWith(`.${extension}`)) {
                callback(event);
            }
        };
        
        // 为所有事件类型注册监听器
        const unsubscribes = [
            this.onFileEvent(FileEventType.CREATE, typeCallback),
            this.onFileEvent(FileEventType.MODIFY, typeCallback),
            this.onFileEvent(FileEventType.DELETE, typeCallback),
            this.onFileEvent(FileEventType.RENAME, typeCallback)
        ];
        
        // 返回一个清理函数
        return () => unsubscribes.forEach(unsub => unsub());
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
    private findFileByName(fileName: string): TFile | null {
        const folder = this.getActiveFolder();
        const files = this.getFiles(folder);
        return files.find(file => file.basename === fileName) || null;
    }
    
    /**
     * 打开指定文件
     */
    private async openFile(file: TFile, newLeaf: boolean = true): Promise<void> {
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
     * 销毁并清理资源
     */
    public destroy(): void {
        // 清理所有订阅
        this.unsubscribes.forEach(unsubscribe => unsubscribe());
        this.unsubscribes = [];
        
        // 销毁事件总线
        this.eventBus.clear();
    }
}  
