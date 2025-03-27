const fs = require('fs');
const path = require('path');

class PerformanceReporter {
    constructor(globalConfig, options) {
        this._globalConfig = globalConfig;
        this._options = options;
    }

    onRunComplete(contexts, results) {
        // 读取性能测试报告
        try {
            const reportPath = path.join(process.cwd(), 'performance-report.txt');
            const report = fs.readFileSync(reportPath, 'utf8');
            
            // 输出报告到控制台
            console.log('\n性能测试报告');
            console.log('='.repeat(50));
            console.log(report);
            console.log('='.repeat(50));

            // 检查是否有失败的测试
            if (report.includes('❌ 失败')) {
                results.success = false;
            }
        } catch (error) {
            console.error('读取性能测试报告失败:', error);
            results.success = false;
        }
    }
}

module.exports = PerformanceReporter; 