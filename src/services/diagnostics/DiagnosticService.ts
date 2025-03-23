import { TFile, Platform, Plugin } from 'obsidian';
import { 
    ILoggerService, 
    IErrorHandler, 
    IPerformanceMonitor, 
    ICacheManager,
    IFileProcessorService
} from '../interfaces/IServices';
import type { ITitleExtractorPlugin } from '../../types';

/**
 * 诊断信息接口
 */
export interface DiagnosticInfo {
    timestamp: number;
    systemInfo: {
        platform: string;
        isMobile: boolean;
        version: string;
        buildTime: string;
    };
    pluginInfo: {
        version: string;
        settings: Record<string, any>;
    };
    performanceMetrics: Record<string, {
        avg: number;
        max: number;
        min: number;
        count: number;
        lastValue: number;
    }>;
    errorHistory: Array<{
        component: string;
        message: string;
        timestamp: number;
        type: string;
        severity: string;
    }>;
    cacheStatus: {
        displayNameSize: number;
        linkSize: number;
        decorationSize: number;
    };
    processingStatus: {
        queueLength: number;
        isProcessing: boolean;
    };
}

/**
 * 诊断服务类
 * 负责收集和导出诊断信息
 */
export class DiagnosticService {
    private debugMode: boolean = false;
    
    constructor(
        private plugin: ITitleExtractorPlugin,
        private logger: ILoggerService,
        private errorHandler: IErrorHandler,
        private performanceMonitor: IPerformanceMonitor,
        private cacheManager: ICacheManager,
        private fileProcessorService: IFileProcessorService
    ) {
        this.logger = logger.getLogger('DiagnosticService');
        this.logger.info('诊断服务已初始化');
    }
    
    /**
     * 设置调试模式
     * @param enabled 是否启用调试模式
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        this.logger.info(`调试模式${enabled ? '已启用' : '已禁用'}`);
        
        // 如果启用调试模式，记录一次诊断信息
        if (enabled) {
            this.logDiagnosticInfo();
        }
    }
    
    /**
     * 收集诊断信息
     */
    public collectDiagnosticInfo(): DiagnosticInfo {
        // 收集系统信息
        const systemInfo = {
            platform: Platform.isWin ? 'Windows' : 
                      Platform.isMacOS ? 'MacOS' : 
                      Platform.isIosApp ? 'iOS' : 
                      Platform.isAndroidApp ? 'Android' : 
                      Platform.isLinux ? 'Linux' : 'Unknown',
            isMobile: Platform.isMobile,
            version: (this.plugin.app as any).vault.config.version || 'Unknown',
            buildTime: new Date().toISOString()
        };
        
        // 收集插件信息
        const pluginInfo = {
            version: this.plugin.manifest.version,
            settings: { ...this.plugin.settings }
        };
        
        // 收集性能指标
        const performanceMetrics = this.performanceMonitor.getReport();
        
        // 收集错误历史
        const errorHistory = this.errorHandler.getErrorHistory();
        
        // 收集缓存状态
        const cacheStatus = this.cacheManager.getStats();
        
        // 收集处理状态
        const processingStatus = this.fileProcessorService.getQueueStatus();
        
        return {
            timestamp: Date.now(),
            systemInfo,
            pluginInfo,
            performanceMetrics,
            errorHistory,
            cacheStatus,
            processingStatus
        };
    }
    
    /**
     * 将诊断信息输出到日志
     */
    public logDiagnosticInfo(): void {
        const info = this.collectDiagnosticInfo();
        this.logger.info('诊断信息: ', JSON.stringify(info, null, 2));
    }
    
    /**
     * 导出诊断信息到文件
     * @param targetPath 导出的文件路径（相对于vault根目录）
     */
    public async exportDiagnosticInfo(targetPath: string = 'filename-display-diagnostics.json'): Promise<boolean> {
        try {
            const info = this.collectDiagnosticInfo();
            const json = JSON.stringify(info, null, 2);
            
            // 确保路径有效
            if (!targetPath.endsWith('.json')) {
                targetPath += '.json';
            }
            
            // 创建文件
            await this.plugin.app.vault.create(targetPath, json);
            
            this.logger.info(`诊断信息已导出到文件: ${targetPath}`);
            return true;
        } catch (error) {
            this.logger.error('导出诊断信息时出错:', error);
            return false;
        }
    }
    
    /**
     * 导出诊断信息到Markdown文件
     * @param targetPath 导出的文件路径（相对于vault根目录）
     */
    public async exportDiagnosticInfoAsMarkdown(targetPath: string = 'filename-display-diagnostics.md'): Promise<boolean> {
        try {
            const info = this.collectDiagnosticInfo();
            
            // 构建Markdown内容
            let markdown = `# 文件名显示插件诊断报告\n\n`;
            markdown += `生成时间: ${new Date(info.timestamp).toLocaleString()}\n\n`;
            
            // 系统信息
            markdown += `## 系统信息\n\n`;
            markdown += `- 平台: ${info.systemInfo.platform}\n`;
            markdown += `- 移动设备: ${info.systemInfo.isMobile ? '是' : '否'}\n`;
            markdown += `- Obsidian版本: ${info.systemInfo.version}\n\n`;
            
            // 插件信息
            markdown += `## 插件信息\n\n`;
            markdown += `- 版本: ${info.pluginInfo.version}\n`;
            markdown += `- 设置:\n\`\`\`json\n${JSON.stringify(info.pluginInfo.settings, null, 2)}\n\`\`\`\n\n`;
            
            // 性能指标
            markdown += `## 性能指标\n\n`;
            markdown += `| 操作 | 平均时间(ms) | 最大时间(ms) | 最小时间(ms) | 调用次数 |\n`;
            markdown += `| ---- | ----------- | ----------- | ----------- | -------- |\n`;
            
            Object.entries(info.performanceMetrics).forEach(([id, metric]) => {
                markdown += `| ${id} | ${metric.avg.toFixed(2)} | ${metric.max.toFixed(2)} | ${metric.min.toFixed(2)} | ${metric.count} |\n`;
            });
            
            markdown += `\n`;
            
            // 错误历史
            markdown += `## 错误历史\n\n`;
            
            if (info.errorHistory.length === 0) {
                markdown += `*无错误记录*\n\n`;
            } else {
                markdown += `| 组件 | 错误信息 | 时间 | 类型 | 严重程度 |\n`;
                markdown += `| ---- | ------- | ---- | ---- | -------- |\n`;
                
                info.errorHistory.forEach(error => {
                    const time = new Date(error.timestamp).toLocaleString();
                    markdown += `| ${error.component} | ${error.message} | ${time} | ${error.type} | ${error.severity} |\n`;
                });
                
                markdown += `\n`;
            }
            
            // 缓存状态
            markdown += `## 缓存状态\n\n`;
            markdown += `- 显示名称缓存: ${info.cacheStatus.displayNameSize} 条目\n`;
            markdown += `- 链接缓存: ${info.cacheStatus.linkSize} 条目\n`;
            markdown += `- 装饰缓存: ${info.cacheStatus.decorationSize} 条目\n\n`;
            
            // 处理状态
            markdown += `## 处理状态\n\n`;
            markdown += `- 队列长度: ${info.processingStatus.queueLength}\n`;
            markdown += `- 处理中: ${info.processingStatus.isProcessing ? '是' : '否'}\n`;
            
            // 确保路径有效
            if (!targetPath.endsWith('.md')) {
                targetPath += '.md';
            }
            
            // 创建文件
            await this.plugin.app.vault.create(targetPath, markdown);
            
            this.logger.info(`诊断信息已导出到Markdown文件: ${targetPath}`);
            return true;
        } catch (error) {
            this.logger.error('导出诊断信息到Markdown时出错:', error);
            return false;
        }
    }
    
    /**
     * 记录当前状态的快照
     */
    public takeSnapshot(): void {
        if (!this.debugMode) return;
        
        const info = this.collectDiagnosticInfo();
        this.logger.debug('状态快照: ', info);
    }
    
    /**
     * 释放资源
     */
    public dispose(): void {
        this.logger.debug('诊断服务资源释放');
    }
} 