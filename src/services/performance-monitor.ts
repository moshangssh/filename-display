export class PerformanceMonitor {
    private updateCount = 0;
    private lastUpdateTime = Date.now();
    private readonly MONITOR_INTERVAL = 60000; // 1分钟

    recordUpdate(): void {
        this.updateCount++;
        const now = Date.now();
        
        if (now - this.lastUpdateTime > this.MONITOR_INTERVAL) {
            console.log(`文件显示更新次数(每分钟): ${this.updateCount}`);
            this.updateCount = 0;
            this.lastUpdateTime = now;
        }
    }

    reset(): void {
        this.updateCount = 0;
        this.lastUpdateTime = Date.now();
    }
}
