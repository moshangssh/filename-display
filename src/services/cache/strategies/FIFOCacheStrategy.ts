import { ICacheStrategy, ICacheStorage, FileCacheItem } from '../interfaces';
import { ILoggerService } from '../../interfaces/IServices';

/**
 * FIFO (First In First Out) 缓存淘汰策略
 * 根据项添加的时间进行淘汰，优先淘汰最早添加的项
 */
export class FIFOCacheStrategy implements ICacheStrategy<string, FileCacheItem> {
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
        
        // 按时间戳排序，保留高优先级项
        const entries = storage.entries()
            .filter(([_, item]) => !item.priority)
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        // 计算实际可淘汰的数量
        const evictCount = Math.min(count, entries.length);
        
        // 删除条目
        for (let i = 0; i < evictCount; i++) {
            storage.delete(entries[i][0]);
        }
        
        this.logger.debug(`FIFO策略淘汰: 删除了${evictCount}个条目, 当前大小=${storage.size()}`);
    }
    
    /**
     * 更新项访问状态
     * @param key 键
     * @param value 值
     */
    public update(key: string, value: FileCacheItem): void {
        // FIFO策略下，只更新访问计数，不更新时间戳
        value.accessCount++;
    }
    
    /**
     * 获取策略名称
     * @returns 策略名称
     */
    public getName(): string {
        return 'FIFO';
    }
} 