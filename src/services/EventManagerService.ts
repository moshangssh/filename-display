import { TFile, TAbstractFile } from 'obsidian';
import type { IFilenameDisplayPlugin } from '../types';

export class EventManagerService {
    private plugin: IFilenameDisplayPlugin;
    
    // 回调函数类型
    private onFileCreateFn: (file: TFile) => void;
    private onFileModifyFn: (file: TFile) => void;
    private onFileRenameFn: (file: TFile, oldPath: string) => void;
    private onFileDeleteFn: (file: TAbstractFile) => void;
    private onMetadataChangeFn: (file: TFile) => void;

    constructor(
        plugin: IFilenameDisplayPlugin,
        onFileCreateFn: (file: TFile) => void,
        onFileModifyFn: (file: TFile) => void,
        onFileRenameFn: (file: TFile, oldPath: string) => void,
        onFileDeleteFn: (file: TAbstractFile) => void,
        onMetadataChangeFn: (file: TFile) => void
    ) {
        this.plugin = plugin;
        
        this.onFileCreateFn = onFileCreateFn;
        this.onFileModifyFn = onFileModifyFn;
        this.onFileRenameFn = onFileRenameFn;
        this.onFileDeleteFn = onFileDeleteFn;
        this.onMetadataChangeFn = onMetadataChangeFn;
    }
    
    // 设置 Vault 事件监听器
    public setupVaultEventListeners(): void {
        // 监听文件创建事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('create', (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    this.onFileCreateFn(file);
                }
            })
        );

        // 监听文件修改事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('modify', (file: TAbstractFile) => {
                if (file instanceof TFile) {
                    this.onFileModifyFn(file);
                }
            })
        );

        // 监听文件重命名事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
                if (file instanceof TFile) {
                    this.onFileRenameFn(file, oldPath);
                }
            })
        );

        // 监听文件删除事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('delete', (file: TAbstractFile) => {
                this.onFileDeleteFn(file);
            })
        );
    }
    
    // 设置元数据事件监听器
    public setupMetadataEventListeners(): void {
        // 监听元数据缓存变更
        this.plugin.registerEvent(
            this.plugin.app.metadataCache.on('changed', (file) => {
                if (file instanceof TFile) {
                    // 检查是否需要更新显示
                    const metadata = this.plugin.app.metadataCache.getFileCache(file);
                    if (metadata?.frontmatter && 'title' in metadata.frontmatter) {
                        this.onMetadataChangeFn(file);
                    }
                }
            })
        );
    }
} 