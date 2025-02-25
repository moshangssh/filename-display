export function measurePerformance(options: { 
    threshold?: number;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
} = {}) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        const { threshold = 100, logLevel = 'info' } = options;

        descriptor.value = async function (...args: any[]) {
            const start = performance.now();
            try {
                const result = await originalMethod.apply(this, args);
                const duration = performance.now() - start;
                
                if (duration > threshold) {
                    console[logLevel](`${propertyKey} 执行时间: ${duration.toFixed(2)}ms`);
                }
                
                return result;
            } catch (error) {
                console.error(`${propertyKey} 执行失败:`, error);
                throw error;
            }
        };

        return descriptor;
    };
}

export class PerformanceMonitor {
    private updateCount = 0;
    private lastUpdateTime = Date.now();
    private readonly MONITOR_INTERVAL = 60000; // 1分钟

    recordUpdate(): void {
        this.updateCount++;
        const now = Date.now();
        
        if (now - this.lastUpdateTime > this.MONITOR_INTERVAL) {
            console.debug(`文件显示更新频率: ${this.updateCount}/分钟`);
            this.updateCount = 0;
            this.lastUpdateTime = now;
        }
    }

    reset(): void {
        this.updateCount = 0;
        this.lastUpdateTime = Date.now();
    }
} 