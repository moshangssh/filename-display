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
        // 如果已经有活跃的观察器，先停止它
        this.stopObserving();
        
        // 只有在文件资源管理器存在时才设置观察器
        const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        if (fileExplorers.length === 0) {
            // 没有文件资源管理器，设置一个监听器等待其创建
            this.plugin.registerEvent(
                this.plugin.app.workspace.on('layout-change', () => {
                    // 检查文件资源管理器是否已创建
                    if (this.plugin.app.workspace.getLeavesOfType('file-explorer').length > 0) {
                        this.setupObservers();
                    }
                })
            );
            console.log('文件资源管理器尚未加载，已注册布局变化监听器');
            return;
        }
        
        // 文件资源管理器存在，设置观察器
        this.setupFileExplorerObserver();
        this.setupFolderObserver();
        console.log('文件资源管理器观察器已完成初始化');
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
        // 使用布局变化事件监听，更稳健地捕获文件夹展开/折叠
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('layout-change', () => {
                // 延迟处理，等待DOM完全更新
                setTimeout(() => {
                    const fileExplorers = this.plugin.app.workspace.getLeavesOfType('file-explorer');
                    fileExplorers.forEach((explorer: WorkspaceLeaf) => {
                        const container = explorer.view.containerEl;
                        if (!container) return;
                        
                        // 查找所有展开的文件夹
                        const expandedFolders = container.querySelectorAll('.nav-folder:not(.is-collapsed)');
                        expandedFolders.forEach((folderElement) => {
                            if (folderElement instanceof HTMLElement && 
                                !folderElement.hasAttribute('data-observer-processed')) {
                                
                                this.processFolderContent(folderElement);
                                // 标记已处理，避免重复处理
                                folderElement.setAttribute('data-observer-processed', 'true');
                            }
                        });
                        
                        // 同时监听展开/折叠按钮的点击
                        const folderArrows = container.querySelectorAll('.nav-folder-collapse-indicator');
                        folderArrows.forEach((arrow) => {
                            if (arrow instanceof HTMLElement && 
                                !arrow.hasAttribute('data-observer-click')) {
                                    
                                arrow.setAttribute('data-observer-click', 'true');
                                arrow.addEventListener('click', (event) => {
                                    // 延迟处理，等待文件夹状态更新
                                    setTimeout(() => {
                                        const folderElement = (event.target as HTMLElement)
                                            .closest('.nav-folder') as HTMLElement;
                                        
                                        if (folderElement) {
                                            if (folderElement.classList.contains('is-collapsed')) {
                                                this.onFolderCollapse(folderElement);
                                            } else {
                                                folderElement.removeAttribute('data-observer-processed');
                                                this.onFolderExpand(folderElement);
                                            }
                                        }
                                    }, 100);
                                });
                            }
                        });
                    });
                }, 200);
            })
        );
        
        console.log('文件夹展开/折叠观察器设置成功');
    }
    
    // 处理文件夹内容
    private processFolderContent(folderElement: HTMLElement): void {
        const folderPath = this.getFolderPath(folderElement);
        if (folderPath) {
            const files = this.getFilesInFolder(folderPath);
            files.forEach(file => this.fileUpdateCallback(file));
        }
    }
    
    // 文件夹展开处理
    private onFolderExpand(folderElement: HTMLElement): void {
        // 使用processFolderContent处理展开的文件夹
        this.processFolderContent(folderElement);
    }
    
    // 文件夹折叠处理
    private onFolderCollapse(folderElement: HTMLElement): void {
        // 移除处理标记，以便下次展开时重新处理
        folderElement.removeAttribute('data-observer-processed');
        // 记录日志，便于调试
        const folderPath = this.getFolderPath(folderElement);
        if (folderPath) {
            console.log(`文件夹已折叠: ${folderPath}`);
        }
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