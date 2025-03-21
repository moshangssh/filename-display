import { ICacheStorage, FileCacheItem } from '../interfaces';

/**
 * 文件缓存存储实现类
 * 负责提供缓存的基本存储功能
 */
export class FileCacheStorage implements ICacheStorage<string, FileCacheItem> {
    private cache: Map<string, FileCacheItem> = new Map();

    /**
     * 获取缓存项
     * @param key 文件路径
     * @returns 缓存项或undefined
     */
    public get(key: string): FileCacheItem | undefined {
        return this.cache.get(key);
    }

    /**
     * 设置缓存项
     * @param key 文件路径
     * @param value 缓存项
     */
    public set(key: string, value: FileCacheItem): void {
        this.cache.set(key, value);
    }

    /**
     * 检查是否存在缓存项
     * @param key 文件路径
     * @returns 是否存在
     */
    public has(key: string): boolean {
        return this.cache.has(key);
    }

    /**
     * 删除缓存项
     * @param key 文件路径
     */
    public delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * 清空缓存
     */
    public clear(): void {
        this.cache.clear();
    }

    /**
     * 获取缓存大小
     * @returns 缓存项数量
     */
    public size(): number {
        return this.cache.size;
    }

    /**
     * 获取所有缓存的键（文件路径）
     * @returns 文件路径数组
     */
    public keys(): string[] {
        return Array.from(this.cache.keys());
    }

    /**
     * 获取所有缓存的值（缓存项）
     * @returns 缓存项数组
     */
    public values(): FileCacheItem[] {
        return Array.from(this.cache.values());
    }

    /**
     * 获取所有缓存的键值对
     * @returns [文件路径, 缓存项]数组
     */
    public entries(): [string, FileCacheItem][] {
        return Array.from(this.cache.entries());
    }
} 