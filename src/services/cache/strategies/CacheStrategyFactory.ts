import { ICacheStrategy, FileCacheItem } from '../interfaces';
import { LRUCacheStrategy } from './LRUCacheStrategy';
import { FIFOCacheStrategy } from './FIFOCacheStrategy';
import { PriorityCacheStrategy } from './PriorityCacheStrategy';
import { CacheCleanStrategy, ILoggerService } from '../../interfaces/IServices';

/**
 * 缓存策略工厂类
 * 根据策略类型创建对应的策略实例
 */
export class CacheStrategyFactory {
    /**
     * 创建缓存淘汰策略
     * @param strategy 策略类型
     * @param logger 日志服务
     * @returns 策略实例
     */
    public static createStrategy(
        strategy: CacheCleanStrategy, 
        logger: ILoggerService
    ): ICacheStrategy<string, FileCacheItem> {
        switch (strategy) {
            case CacheCleanStrategy.LRU:
                return new LRUCacheStrategy(logger);
                
            case CacheCleanStrategy.FIFO:
                return new FIFOCacheStrategy(logger);
                
            case CacheCleanStrategy.PRIORITY:
                return new PriorityCacheStrategy(logger);
                
            default:
                logger.warn(`未知的缓存清理策略: ${strategy}，使用默认的LRU策略`);
                return new LRUCacheStrategy(logger);
        }
    }
} 