import { PerformanceThreshold, PerformanceReport, PerformanceMetrics } from './types/performance';
import { performanceConfig } from './perf.config';
import fs from 'fs';
import path from 'path';

export class PerformanceTestRunner {
    private static instance: PerformanceTestRunner;
    private reports: PerformanceReport[] = [];
    private baselinePath: string;

    private constructor() {
        this.baselinePath = path.join(__dirname, 'baseline.json');
    }

    static getInstance(): PerformanceTestRunner {
        if (!PerformanceTestRunner.instance) {
            PerformanceTestRunner.instance = new PerformanceTestRunner();
        }
        return PerformanceTestRunner.instance;
    }

    validateMetrics(testName: string, metrics: PerformanceMetrics): PerformanceReport {
        const thresholds = performanceConfig[testName];
        if (!thresholds) {
            throw new Error(`未找到测试"${testName}"的性能阈值配置`);
        }

        const violations: string[] = [];
        
        // 检查操作时间
        if (metrics.operationTime > thresholds.maxOperationTime) {
            violations.push(`操作时间 ${metrics.operationTime}ms 超过阈值 ${thresholds.maxOperationTime}ms`);
        }

        // 检查内存使用
        if (metrics.memoryUsage / 1024 / 1024 > thresholds.maxMemoryUsage) {
            violations.push(`内存使用 ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB 超过阈值 ${thresholds.maxMemoryUsage}MB`);
        }

        // 检查DOM操作次数
        if (metrics.domOperations > thresholds.maxDomOperations) {
            violations.push(`DOM操作次数 ${metrics.domOperations} 超过阈值 ${thresholds.maxDomOperations}`);
        }

        // 检查缓存命中率
        const cacheHitRate = metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses);
        if (cacheHitRate < thresholds.minCacheHitRate) {
            violations.push(`缓存命中率 ${(cacheHitRate * 100).toFixed(2)}% 低于阈值 ${(thresholds.minCacheHitRate * 100).toFixed(2)}%`);
        }

        // 检查内存增长（如果适用）
        if (thresholds.maxMemoryGrowth && metrics.memoryGrowth) {
            if (metrics.memoryGrowth > thresholds.maxMemoryGrowth) {
                violations.push(`内存增长 ${metrics.memoryGrowth}MB 超过阈值 ${thresholds.maxMemoryGrowth}MB`);
            }
        }

        // 检查内存保留率（如果适用）
        if (thresholds.maxMemoryRetention && metrics.memoryRetention) {
            if (metrics.memoryRetention > thresholds.maxMemoryRetention) {
                violations.push(`内存保留率 ${metrics.memoryRetention} 超过阈值 ${thresholds.maxMemoryRetention}`);
            }
        }

        const report: PerformanceReport = {
            testName,
            metrics: {
                operationTime: metrics.operationTime,
                memoryUsage: metrics.memoryUsage,
                domOperations: metrics.domOperations,
                cacheHitRate,
                memoryGrowth: metrics.memoryGrowth,
                memoryRetention: metrics.memoryRetention
            },
            thresholds,
            passed: violations.length === 0,
            violations
        };

        this.reports.push(report);
        return report;
    }

    compareWithBaseline(currentMetrics: Record<string, PerformanceMetrics>): string[] {
        const warnings: string[] = [];
        
        try {
            const baselineContent = fs.readFileSync(this.baselinePath, 'utf-8');
            const baseline = JSON.parse(baselineContent) as Record<string, PerformanceMetrics>;

            // 计算性能退化
            const degradationThreshold = 0.1; // 10%的性能退化阈值
            
            for (const [testName, metrics] of Object.entries(currentMetrics)) {
                const baselineMetrics = baseline[testName];
                if (!baselineMetrics) continue;

                // 检查操作时间退化
                const timeIncrease = (metrics.operationTime - baselineMetrics.operationTime) / baselineMetrics.operationTime;
                if (timeIncrease > degradationThreshold) {
                    warnings.push(`${testName}: 操作时间增加了${(timeIncrease * 100).toFixed(2)}%`);
                }

                // 检查内存使用退化
                const memoryIncrease = (metrics.memoryUsage - baselineMetrics.memoryUsage) / baselineMetrics.memoryUsage;
                if (memoryIncrease > degradationThreshold) {
                    warnings.push(`${testName}: 内存使用增加了${(memoryIncrease * 100).toFixed(2)}%`);
                }

                // 检查缓存效率退化
                const currentHitRate = metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses);
                const baselineHitRate = baselineMetrics.cacheHits / (baselineMetrics.cacheHits + baselineMetrics.cacheMisses);
                const hitRateDecrease = (baselineHitRate - currentHitRate) / baselineHitRate;
                if (hitRateDecrease > degradationThreshold) {
                    warnings.push(`${testName}: 缓存命中率下降了${(hitRateDecrease * 100).toFixed(2)}%`);
                }
            }
        } catch (error) {
            console.warn('无法读取或比较基准性能数据:', error);
        }

        return warnings;
    }

    updateBaseline(metrics: Record<string, PerformanceMetrics>): void {
        try {
            fs.writeFileSync(this.baselinePath, JSON.stringify(metrics, null, 2));
            console.log('已更新性能基准数据');
        } catch (error) {
            console.error('更新性能基准数据失败:', error);
        }
    }

    generateReport(): string {
        let report = '性能测试报告\n\n';

        // 添加测试结果摘要
        const totalTests = this.reports.length;
        const passedTests = this.reports.filter(r => r.passed).length;
        report += `测试总数: ${totalTests}\n`;
        report += `通过数量: ${passedTests}\n`;
        report += `失败数量: ${totalTests - passedTests}\n\n`;

        // 添加详细测试结果
        for (const testReport of this.reports) {
            report += `测试场景: ${testReport.testName}\n`;
            report += `状态: ${testReport.passed ? '✅ 通过' : '❌ 失败'}\n`;
            
            // 添加性能指标
            report += '性能指标:\n';
            report += `- 操作时间: ${testReport.metrics.operationTime.toFixed(2)}ms\n`;
            report += `- 内存使用: ${(testReport.metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB\n`;
            report += `- DOM操作: ${testReport.metrics.domOperations}\n`;
            report += `- 缓存命中率: ${(testReport.metrics.cacheHitRate * 100).toFixed(2)}%\n`;

            if (testReport.metrics.memoryGrowth !== undefined) {
                report += `- 内存增长: ${testReport.metrics.memoryGrowth.toFixed(2)}MB\n`;
            }
            if (testReport.metrics.memoryRetention !== undefined) {
                report += `- 内存保留率: ${testReport.metrics.memoryRetention.toFixed(2)}\n`;
            }

            // 如果有违规，添加违规信息
            if (testReport.violations.length > 0) {
                report += '\n违规项:\n';
                for (const violation of testReport.violations) {
                    report += `- ${violation}\n`;
                }
            }

            report += '\n';
        }

        return report;
    }

    clearReports(): void {
        this.reports = [];
    }
} 