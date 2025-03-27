import { PerformanceThresholds } from './types/performance';

export const performanceConfig: PerformanceThresholds = {
    // 基准性能测试阈值
    '大量文件处理性能': {
        maxOperationTime: 5000,    // 最大操作时间（毫秒）
        maxMemoryUsage: 100,       // 最大内存使用（MB）
        maxDomOperations: 1000,    // 最大DOM操作次数
        minCacheHitRate: 0.7       // 最小缓存命中率
    },
    '频繁文件更新性能': {
        maxOperationTime: 1000,
        maxMemoryUsage: 50,
        maxDomOperations: 100,
        minCacheHitRate: 0.8
    },
    '深层文件夹处理性能': {
        maxOperationTime: 3000,
        maxMemoryUsage: 75,
        maxDomOperations: 200,
        minCacheHitRate: 0.75
    },

    // 内存使用测试阈值
    '内存使用效率': {
        maxOperationTime: 3000,
        maxMemoryUsage: 100,
        maxDomOperations: 1000,
        minCacheHitRate: 0.6,
        maxMemoryGrowth: 50        // 最大内存增长（MB）
    },
    '资源释放效率': {
        maxOperationTime: 1000,
        maxMemoryUsage: 50,
        maxDomOperations: 100,
        minCacheHitRate: 0.6,
        maxMemoryRetention: 1.5    // 最大内存保留率
    },

    // 缓存效率测试阈值
    '缓存命中效率': {
        maxOperationTime: 500,
        maxMemoryUsage: 30,
        maxDomOperations: 100,
        minCacheHitRate: 0.8
    },
    '缓存失效处理': {
        maxOperationTime: 300,
        maxMemoryUsage: 30,
        maxDomOperations: 50,
        minCacheHitRate: 0.5       // 允许较低的命中率，因为测试包含失效场景
    },

    // 复合性能测试阈值
    '混合操作性能': {
        maxOperationTime: 5000,
        maxMemoryUsage: 150,
        maxDomOperations: 500,
        minCacheHitRate: 0.6
    }
}; 