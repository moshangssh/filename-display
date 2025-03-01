import { App, TFile, TFolder, normalizePath } from 'obsidian';

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
    private fileChangeHandlers: Set<() => void> = new Set();

    constructor(
        private app: App,
        private config: FileManagerConfig
    ) {
        // 监听文件变更事件
        this.app.vault.on('modify', () => this.notifyFileChange());
        this.app.vault.on('create', () => this.notifyFileChange());
        this.app.vault.on('delete', () => this.notifyFileChange());
        this.app.vault.on('rename', () => this.notifyFileChange());
    }

    /**
     * 通知文件变更
     */
    private notifyFileChange(): void {
        this.fileChangeHandlers.forEach(handler => handler());
    }

    /**
     * 注册文件变更处理器
     */
    public onFileChange(handler: () => void): void {
        this.fileChangeHandlers.add(handler);
    }

    /**
     * 移除文件变更处理器
     */
    public offFileChange(handler: () => void): void {
        this.fileChangeHandlers.delete(handler);
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
}  
