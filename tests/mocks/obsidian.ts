// 为性能测试创建的 Obsidian API 模拟
export class TFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    stat: {
        mtime: number;
        ctime: number;
        size: number;
    };

    constructor(path: string, name: string) {
        this.path = path;
        this.name = name;
        const parts = name.split('.');
        this.extension = parts.length > 1 ? parts.pop() || '' : '';
        this.basename = parts.join('.');
        this.stat = {
            mtime: Date.now(),
            ctime: Date.now(),
            size: 0
        };
    }
}

export class TFolder {
    path: string;
    name: string;
    children: (TFile | TFolder)[];

    constructor(path: string, name: string, children: (TFile | TFolder)[] = []) {
        this.path = path;
        this.name = name;
        this.children = children;
    }
}

export class WorkspaceLeaf {
    view: any;
    
    constructor(view: any = {}) {
        this.view = view;
    }
    
    getViewState() {
        return {
            type: 'file',
            state: { file: '' }
        };
    }
}

export function normalizePath(path: string): string {
    // 简单的路径标准化实现
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

// 导出其他可能需要的 Obsidian API 模拟
export const App = {
    vault: {
        getAbstractFileByPath: jest.fn(),
        getAllLoadedFiles: jest.fn(),
    }
};

// 其他 Obsidian 接口模拟
export interface MetadataCache {
    getFileCache: (file: TFile) => any;
}

export interface Vault {
    getAbstractFileByPath: (path: string) => TFile | TFolder | null;
    getAllLoadedFiles: () => (TFile | TFolder)[];
}

export interface App {
    vault: Vault;
    metadataCache: MetadataCache;
}

export interface Plugin {
    app: App;
} 