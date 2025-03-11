import { TFile, WorkspaceLeaf } from 'obsidian';
import type { ITitleExtractorPlugin } from '../types';

// DOM观察器类，负责监控文件资源管理器的DOM变化
export class FileExplorerObserver {
    private plugin: ITitleExtractorPlugin;
    private fileExplorerObserver: MutationObserver | null = null;
    private folderObserver: MutationObserver | null = null;
    private updateCallback: () => void;
    private fileUpdateCallback: (file: TFile) => void;
    private addedNodesCallback: (nodes: Node[]) => void;
    
    constructor(
        plugin: ITitleExtractorPlugin, 
        updateCallback: () => void,
        fileUpdateCallback: (file: TFile) => void,
        addedNodesCallback: (nodes: Node[]) => void
    ) {
        this.plugin = plugin;
        this.updateCallback = updateCallback;
        this.fileUpdateCallback = fileUpdateCallback;
        this.addedNodesCallback = addedNodesCallback;
    }
    
    // 设置文件资源管理器观察器
    public setupObservers(): void {
        this.setupFileExplorerObserver();
        this.setupFolderObserver();
    }
    
    // 停止所有观察
    public stopObserving(): void {
        if (this.fileExplorerObserver) {
            this.fileExplorerObserver.disconnect();
            this.fileExplorerObserver = null;
        }
        
        if (this.folderObserver) {
            this.folderObserver.disconnect();
            this.folderObserver = null;
        }
    }
    
    // 设置文件资源管理器的DOM观察器
    private setupFileExplorerObserver(): void {
        // 创建MutationObserver实例监听DOM变化
        this.fileExplorerObserver = new MutationObserver((mutations) => {
            // 如果发现文件名相关元素变化，更新文件显示
            let shouldUpdate = false;
            let addedNodes: Node[] = [];
            
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    // 收集所有添加的节点
                    addedNodes = [...addedNodes, ...Array.from(mutation.addedNodes)];
                    
                    // 检查变动是否与文件名相关
                    const hasFileItems = Array.from(mutation.addedNodes).some(node => {
                        if (node instanceof HTMLElement) {
                            return node.classList.contains('nav-file-title') || 
                                  node.querySelector('.nav-file-title') !== null;
                        }
                        return false;
                    });
                    
                    if (hasFileItems) {
                        shouldUpdate = true;
                    }
                }
            }
            
            if (shouldUpdate) {
                // 增量更新：只更新新添加的节点
                this.addedNodesCallback(addedNodes);
            }
        });

        this.startObserving();
    }
    
    // 设置文件夹展开/折叠观察器
    private setupFolderObserver(): void {
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        
        fileExplorers.forEach((explorer: WorkspaceLeaf) => {
            const container = explorer.view.containerEl;
            
            container.on('click', '.nav-folder-title', (event: MouseEvent) => {
                const folderTitle = (event.currentTarget as HTMLElement);
                const folderElement = folderTitle.parentElement as HTMLElement;
                
                // 检查文件夹是否是折叠状态
                setTimeout(() => {
                    if (folderElement.hasClass('is-collapsed')) {
                        this.onFolderCollapse(folderElement);
                    } else {
                        this.onFolderExpand(folderElement);
                    }
                }, 100); // 短暂延迟以确保DOM更新
            });
        });
    }
    
    // 文件夹展开处理
    private onFolderExpand(folderElement: HTMLElement): void {
        const folderPath = this.getFolderPath(folderElement);
        if (folderPath) {
            const files = this.getFilesInFolder(folderPath);
            files.forEach(file => this.fileUpdateCallback(file));
        }
    }
    
    // 文件夹折叠处理
    private onFolderCollapse(folderElement: HTMLElement): void {
        // 当文件夹折叠时可能需要的处理
    }
    
    // 获取文件夹路径
    private getFolderPath(element: HTMLElement): string {
        const pathAttr = element.getAttribute('data-path');
        return pathAttr || '';
    }
    
    // 获取文件夹中的文件
    private getFilesInFolder(folderPath: string): TFile[] {
        return this.plugin.app.vault.getMarkdownFiles().filter((file: TFile) => 
            file.path.startsWith(folderPath + '/'));
    }
    
    // 开始观察文件资源管理器
    private startObserving(): void {
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        
        // 如果没有找到文件资源管理器，记录日志并退出
        if (fileExplorers.length === 0) {
            console.log('文件资源管理器尚未加载，将在懒加载机制中重试');
            return;
        }
        
        fileExplorers.forEach((explorer: WorkspaceLeaf) => {
            try {
                const container = explorer.view.containerEl;
                if (container) {
                    // 找到文件列表容器，减少观察范围
                    const fileListContainer = container.querySelector('.nav-files-container');
                    if (fileListContainer) {
                        this.fileExplorerObserver?.observe(fileListContainer, {
                            childList: true,
                            subtree: true,
                            attributes: false,
                            characterData: false
                        });
                        console.log('成功设置文件资源管理器观察器');
                    } else {
                        // 如果找不到特定容器，回退到原始行为
                        this.fileExplorerObserver?.observe(container, {
                            childList: true,
                            subtree: true,
                            attributes: false,
                            characterData: false
                        });
                    }
                }
            } catch (error) {
                console.error('设置文件资源管理器观察器时发生错误:', error);
            }
        });
    }
} 