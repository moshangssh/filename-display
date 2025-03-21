import { ICacheStrategy, ICacheStorage, FileCacheItem } from '../interfaces';
import { ILoggerService } from '../../interfaces/IServices';

/**
 * LRU (Least Recently Used) 缓存淘汰策略
 * 根据访问时间和访问计数进行淘汰，保留最近访问的项
 */
export class LRUCacheStrategy implements ICacheStrategy<string, FileCacheItem> {
    /**
     * 构造函数
     * @param logger 日志服务
     */
    constructor(private logger: ILoggerService) {}
    
    /**
     * 淘汰缓存项
     * @param storage 缓存存储
     * @param count 要淘汰的数量
     */
    public evict(storage: ICacheStorage<string, FileCacheItem>, count: number): void {
        if (count <= 0 || storage.size() === 0) return;
        
        // 按访问计数和时间戳排序，保留高优先级项
        const entries = storage.entries()
            .filter(([_, item]) => !item.priority) // 保留优先级项
            .sort((a, b) => {
                // 首先按访问计数排序
                if (a[1].accessCount !== b[1].accessCount) {
                    return a[1].accessCount - b[1].accessCount;
                }
                // 访问计数相同时按时间戳排序
                return a[1].timestamp - b[1].timestamp;
            });
        
        // 计算实际可淘汰的数量
        const evictCount = Math.min(count, entries.length);
        
        // 删除条目
        for (let i = 0; i < evictCount; i++) {
            storage.delete(entries[i][0]);
        }
        
        this.logger.debug(`LRU策略淘汰: 删除了${evictCount}个条目, 当前大小=${storage.size()}`);
    }
    
    /**
     * 更新项访问状态
     * @param key 键
     * @param value 值
     */
    public update(key: string, value: FileCacheItem): void {
        // LRU策略下，更新访问时间和计数，在FileCacheItem中已有实现
        // 这里不需要额外操作
        value.timestamp = Date.now();
        value.accessCount++;
    }
    
    /**
     * 获取策略名称
     * @returns 策略名称
     */
    public getName(): string {
        return 'LRU';
    }
} 