import { ICacheStrategy, ICacheStorage, FileCacheItem } from '../interfaces';
import { ILoggerService } from '../../interfaces/IServices';

/**
 * 优先级缓存淘汰策略
 * 根据项优先级、访问计数和访问时间进行淘汰
 */
export class PriorityCacheStrategy implements ICacheStrategy<string, FileCacheItem> {
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
        
        // 按优先级、访问计数和时间戳排序
        const entries = storage.entries()
            .sort((a, b) => {
                // 优先级高的保留
                if (a[1].priority !== b[1].priority) {
                    return a[1].priority ? 1 : -1;
                }
                // 访问计数高的保留
                if (a[1].accessCount !== b[1].accessCount) {
                    return a[1].accessCount - b[1].accessCount;
                }
                // 最后按时间戳
                return a[1].timestamp - b[1].timestamp;
            });
        
        // 计算实际可淘汰的数量
        const evictCount = Math.min(count, entries.length);
        
        // 删除条目
        for (let i = 0; i < evictCount; i++) {
            storage.delete(entries[i][0]);
        }
        
        this.logger.debug(`优先级策略淘汰: 删除了${evictCount}个条目, 当前大小=${storage.size()}`);
    }
    
    /**
     * 更新项访问状态
     * @param key 键
     * @param value 值
     */
    public update(key: string, value: FileCacheItem): void {
        // 优先级策略下，更新访问时间和计数
        value.timestamp = Date.now();
        value.accessCount++;
    }
    
    /**
     * 获取策略名称
     * @returns 策略名称
     */
    public getName(): string {
        return 'Priority';
    }
} 