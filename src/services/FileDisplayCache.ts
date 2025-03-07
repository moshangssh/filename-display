// 文件缓存管理器类，负责处理文件显示名称的缓存
export class FileDisplayCache {
    private fileDisplayCache: Map<string, string> = new Map();
    private processedFiles: Set<string> = new Set();
    private originalDisplayNames: Map<string, string> = new Map();
    
    constructor() {
        // 初始化缓存
    }
    
    // 保存原始显示名称
    public saveOriginalName(path: string, originalName: string): void {
        if (!this.originalDisplayNames.has(path)) {
            this.originalDisplayNames.set(path, originalName);
        }
    }
    
    // 获取原始显示名称
    public getOriginalName(path: string): string | undefined {
        return this.originalDisplayNames.get(path);
    }
    
    // 检查路径是否有缓存的显示名称
    public hasDisplayName(path: string): boolean {
        return this.fileDisplayCache.has(path);
    }
    
    // 获取缓存的显示名称
    public getDisplayName(path: string): string | undefined {
        return this.fileDisplayCache.get(path);
    }
    
    // 设置显示名称缓存
    public setDisplayName(path: string, displayName: string): void {
        this.fileDisplayCache.set(path, displayName);
        this.processedFiles.add(path);
    }
    
    // 删除路径的缓存
    public deletePath(path: string): void {
        this.fileDisplayCache.delete(path);
        this.processedFiles.delete(path);
        this.originalDisplayNames.delete(path);
    }
    
    // 判断文件是否已处理
    public isProcessed(path: string): boolean {
        return this.processedFiles.has(path);
    }
    
    // 清除所有缓存
    public clearAll(): void {
        this.fileDisplayCache.clear();
        this.processedFiles.clear();
    }
    
    // 获取所有原始名称
    public getAllOriginalNames(): Map<string, string> {
        return this.originalDisplayNames;
    }
} 