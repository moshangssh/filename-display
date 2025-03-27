export interface PerformanceMetrics {
    operationTime: number;
    memoryUsage: number;
    domOperations: number;
    cacheHits: number;
    cacheMisses: number;
    memoryGrowth?: number;
    memoryRetention?: number;
}

export interface PerformanceThreshold {
    maxOperationTime: number;      // 最大操作时间（毫秒）
    maxMemoryUsage: number;        // 最大内存使用（MB）
    maxDomOperations: number;      // 最大DOM操作次数
    minCacheHitRate: number;       // 最小缓存命中率
    maxMemoryGrowth?: number;      // 最大内存增长（MB）
    maxMemoryRetention?: number;   // 最大内存保留率
}

export interface PerformanceThresholds {
    [testName: string]: PerformanceThreshold;
}

export interface PerformanceReport {
    testName: string;
    metrics: {
        operationTime: number;
        memoryUsage: number;
        domOperations: number;
        cacheHitRate: number;
        memoryGrowth?: number;
        memoryRetention?: number;
    };
    thresholds: PerformanceThreshold;
    passed: boolean;
    violations: string[];
} 