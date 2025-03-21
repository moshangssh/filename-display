import { FileDisplayResult } from '../../../types';

// 定义文件缓存项类型
export interface FileCacheItem {
    displayName: string;         // 显示名称
    originalName: string;        // 原始名称
    timestamp: number;           // 最后访问时间戳
    mtime: number;               // 文件修改时间
    processed: boolean;          // 是否已处理
    links: Set<string>;          // 该文件引用的其他文件
    priority: boolean;           // 是否为高优先级
    accessCount: number;         // 访问计数，用于LRU策略
    result?: FileDisplayResult;  // 存储结果对象，便于实现get/set方法
}

// 缓存数据结构，用于持久化
export interface CacheData {
    fileCache: [string, Omit<FileCacheItem, 'links'> & { links: string[] }][];
} 