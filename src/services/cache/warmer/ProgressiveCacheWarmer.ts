import { ICacheWarmer } from '../interfaces';
import { ILoggerService, ITimerService, IFileProcessorService } from '../../interfaces/IServices';
import { TFile, MarkdownView } from 'obsidian';
import { ServiceContainer } from '../../../core/ServiceContainer';

/**
 * 渐进式缓存预热器
 * 分批处理文件，避免阻塞主线程
 */
export class ProgressiveCacheWarmer implements ICacheWarmer {
    private warmupProgress: number = 0;
    private isWarmupCancelled: boolean = false;
    private warmupPromise: Promise<void> | null = null;
    private warmupTaskId: string = '';
    
    /**
     * 构造函数
     * @param plugin Obsidian插件实例
     * @param logger 日志服务
     * @param timerService 定时器服务
     * @param fileProcessorService 文件处理服务（可选）
     */
    constructor(
        private plugin: any,
        private logger: ILoggerService,
        private timerService: ITimerService,
        private fileProcessorService?: IFileProcessorService
    ) {}
    
    /**
     * 从服务容器获取文件处理服务
     * 在需要时延迟获取，避免循环依赖问题
     */
    private getFileProcessorService(): IFileProcessorService | null {
        // 如果已有直接依赖的处理服务实例，优先使用
        if (this.fileProcessorService) {
            return this.fileProcessorService;
        }
        
        // 否则尝试从服务容器获取
        try {
            const container = ServiceContainer.getInstance();
            if (container.has('fileProcessorService')) {
                return container.get<IFileProcessorService>('fileProcessorService');
            }
        } catch (error) {
            this.logger.error('从服务容器获取fileProcessorService失败:', error);
        }
        
        return null;
    }
    
    /**
     * 开始预热缓存
     * @returns 预热完成的Promise
     */
    public async warmUp(): Promise<void> {
        // 防止同时多次预热
        if (this.warmupPromise) {
            this.logger.log('缓存预热已在进行中，返回现有Promise');
            return this.warmupPromise;
        }
        
        // 创建新的任务ID
        this.warmupTaskId = `warmup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const currentTaskId = this.warmupTaskId;
        
        // 重置状态
        this.warmupProgress = 0;
        this.isWarmupCancelled = false;
        
        // 开始进度报告
        this.startProgressReporting();
        
        // 创建并存储预热Promise
        this.warmupPromise = (async () => {
            try {
                this.logger.log('开始执行缓存预热...');
                
                // 更新进度
                this.warmupProgress = 10;
                
                // 检查是否已取消
                if (this.checkWarmupCancelled() || currentTaskId !== this.warmupTaskId) {
                    return;
                }
                
                // 加载所有markdown文件
                let files: TFile[] = [];
                try {
                    if (!this.plugin?.app?.vault) {
                        this.logger.error('无法访问Vault，可能是插件初始化时序问题');
                        this.warmupProgress = 100;
                        return;
                    }
                    
                    this.logger.log('尝试获取Markdown文件...');
                    const vault = this.plugin.app.vault;
                    
                    // 确保vault.getMarkdownFiles方法存在
                    if (typeof vault.getMarkdownFiles !== 'function') {
                        this.logger.error('Vault.getMarkdownFiles方法不存在，使用备用方法');
                        
                        // 备用方法：获取所有文件然后过滤
                        const allFiles = vault.getFiles() || [];
                        files = allFiles.filter((file: TFile) => file.extension === 'md');
                        this.logger.log(`使用备用方法找到 ${files.length} 个Markdown文件`);
                    } else {
                        // 使用标准方法
                        files = vault.getMarkdownFiles() || [];
                        this.logger.log(`使用标准方法找到 ${files.length} 个Markdown文件`);
                    }
                } catch (error) {
                    this.logger.error('获取Markdown文件时出错:', error);
                    files = [];
                }
                
                if (!files || !files.length) {
                    this.logger.debug('未找到Markdown文件，等待2秒后重试...');
                    
                    // 延迟重试，可能是Obsidian还在加载文件
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    try {
                        const vault = this.plugin?.app?.vault;
                        if (vault) {
                            if (typeof vault.getMarkdownFiles === 'function') {
                                files = vault.getMarkdownFiles() || [];
                            } else if (typeof vault.getFiles === 'function') {
                                const allFiles = vault.getFiles() || [];
                                files = allFiles.filter((file: TFile) => file.extension === 'md');
                            }
                            
                            this.logger.log(`重试后找到 ${files.length} 个Markdown文件`);
                        }
                    } catch (retryError) {
                        this.logger.error('重试获取Markdown文件时出错:', retryError);
                    }
                    
                    // 如果仍然没有找到文件，设置为已预热并返回
                    if (!files.length) {
                        this.logger.debug('即使在重试后仍未找到Markdown文件，缓存预热结束');
                        this.warmupProgress = 100;
                        return;
                    }
                }
                
                // 更新进度
                this.warmupProgress = 20;
                
                // 检查是否已取消
                if (this.checkWarmupCancelled() || currentTaskId !== this.warmupTaskId) {
                    return;
                }
                
                // 分离可见文件和其他文件
                this.logger.log('分离可见文件和其他文件...');
                let visibleFiles: TFile[] = [];
                let otherFiles: TFile[] = [];
                
                if (this.fileProcessorService) {
                    // 如果可用，使用文件处理服务的方法
                    const result = this.fileProcessorService.separateFilesByVisibility(files);
                    visibleFiles = result.visibleFiles;
                    otherFiles = result.otherFiles;
                } else {
                    // 如果文件处理服务不可用，使用内部方法
                    const result = this.separateFilesByVisibility(files);
                    visibleFiles = result.visibleFiles;
                    otherFiles = result.otherFiles;
                }
                
                // 更新进度
                this.warmupProgress = 30;
                
                // 检查是否已取消
                if (this.checkWarmupCancelled() || currentTaskId !== this.warmupTaskId) {
                    return;
                }
                
                // 先处理可见文件
                this.logger.log(`开始处理 ${visibleFiles.length} 个可见文件...`);
                let processedCount = 0;
                const batchSize = 20;
                
                for (let i = 0; i < visibleFiles.length; i += batchSize) {
                    // 检查是否已取消
                    if (this.checkWarmupCancelled() || currentTaskId !== this.warmupTaskId) {
                        return;
                    }
                    
                    const batch = visibleFiles.slice(i, i + batchSize);
                    
                    // 处理这一批文件
                    if (this.fileProcessorService && typeof this.fileProcessorService.processFile === 'function') {
                        await Promise.all(
                            batch.map(file => this.fileProcessorService!.processFile(file))
                        );
                    } else {
                        // 如果文件处理服务不可用，使用替代方法
                        await this.processFilesBatch(batch);
                    }
                    
                    processedCount += batch.length;
                    
                    // 计算可见文件的进度（30%-60%）
                    const visibleProgress = 30 + Math.min(30, Math.floor(30 * processedCount / visibleFiles.length));
                    this.warmupProgress = visibleProgress;
                    
                    // 让UI有机会更新（避免长时间阻塞主线程）
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                
                // 更新进度
                this.warmupProgress = 60;
                
                // 检查是否已取消
                if (this.checkWarmupCancelled() || currentTaskId !== this.warmupTaskId) {
                    return;
                }
                
                // 使用TimerService在空闲时间处理其余文件
                if (otherFiles.length > 0) {
                    this.logger.log(`在后台处理 ${otherFiles.length} 个其他文件...`);
                    
                    for (let i = 0; i < otherFiles.length; i += batchSize) {
                        // 检查是否已取消
                        if (this.checkWarmupCancelled() || currentTaskId !== this.warmupTaskId) {
                            return;
                        }
                        
                        const batch = otherFiles.slice(i, i + batchSize);
                        
                        // 使用Promise.all处理一批文件，但使用requestIdleCallback调度
                        await new Promise<void>((resolve) => {
                            this.timerService.requestIdleCallback(async () => {
                                try {
                                    // 处理这一批文件
                                    if (this.fileProcessorService && typeof this.fileProcessorService.processFile === 'function') {
                                        await Promise.all(
                                            batch.map(file => this.fileProcessorService!.processFile(file))
                                        );
                                    } else {
                                        // 如果文件处理服务不可用，使用替代方法
                                        await this.processFilesBatch(batch);
                                    }
                                    
                                    // 计算其他文件的进度（60%-90%）
                                    const totalProcessed = i + batch.length;
                                    const otherProgress = 60 + Math.min(30, Math.floor(30 * totalProcessed / otherFiles.length));
                                    this.warmupProgress = otherProgress;
                                } catch (error) {
                                    this.logger.error('处理文件批次时出错:', error);
                                }
                                
                                resolve();
                            });
                        });
                    }
                }
                
                // 检查是否已取消
                if (this.checkWarmupCancelled() || currentTaskId !== this.warmupTaskId) {
                    return;
                }
                
                // 标记预热完成
                this.warmupProgress = 100;
                this.logger.log('缓存预热完成');
                
                // 报告最终进度
                this.reportProgress();
            } catch (error) {
                this.logger.error('缓存预热失败:', error);
            } finally {
                // 停止进度报告
                this.stopProgressReporting();
                
                // 只有当当前任务ID仍然是活动的，才清除warmupPromise
                if (currentTaskId === this.warmupTaskId) {
                    this.warmupPromise = null;
                }
            }
        })();
        
        return this.warmupPromise;
    }
    
    /**
     * 取消预热过程
     */
    public cancel(): void {
        if (!this.warmupPromise) {
            this.logger.debug('没有正在进行的缓存预热过程可取消');
            return;
        }
        
        this.logger.log('取消缓存预热过程');
        this.isWarmupCancelled = true;
        this.warmupTaskId = ''; // 清空任务ID，允许新任务开始
        this.stopProgressReporting(); // 停止进度报告
    }
    
    /**
     * 获取预热进度
     * @returns 预热进度（0-100）
     */
    public getProgress(): number {
        return this.warmupProgress;
    }
    
    /**
     * 检查是否正在预热
     * @returns 是否正在预热
     */
    public isWarming(): boolean {
        return this.warmupPromise !== null;
    }
    
    /**
     * 检查预热是否已被取消
     * @private
     */
    private checkWarmupCancelled(): boolean {
        if (this.isWarmupCancelled) {
            this.logger.log('缓存预热已被取消');
            this.warmupProgress = 0;
            this.isWarmupCancelled = false; // 重置取消标志
            this.warmupPromise = null;
            return true;
        }
        return false;
    }
    
    /**
     * 分离可见文件和其他文件
     * 优先使用从服务容器获取的处理服务
     */
    private separateFilesByVisibility(files: TFile[]): { visibleFiles: TFile[], otherFiles: TFile[] } {
        // 尝试从服务容器获取处理服务
        const processorService = this.getFileProcessorService();
        
        if (processorService) {
            // 如果获取到处理服务，使用其方法
            try {
                return processorService.separateFilesByVisibility(files);
            } catch (error) {
                this.logger.error('使用处理服务分离文件失败:', error);
                // 出错时回退到内部实现
            }
        }
        
        // 如果没有处理服务或处理服务调用失败，使用内部实现
        try {
            // 获取当前所有可见的文件
            const visibleFiles = new Set<string>();
            
            // 添加当前活动编辑器中的文件
            const activeFile = this.plugin?.app?.workspace?.getActiveViewOfType(MarkdownView)?.file;
            if (activeFile) {
                visibleFiles.add(activeFile.path);
            }
            
            // 添加所有当前打开的标签页中的文件
            try {
                if (this.plugin?.app?.workspace?.iterateAllLeaves) {
                    this.plugin.app.workspace.iterateAllLeaves((leaf: any) => {
                        const fileFromView = leaf.view?.file;
                        if (fileFromView) {
                            visibleFiles.add(fileFromView.path);
                        }
                    });
                }
            } catch (e) {
                this.logger.error('迭代标签页失败:', e);
            }
            
            // 分离文件
            const visible: TFile[] = [];
            const others: TFile[] = [];
            
            for (const file of files) {
                if (visibleFiles.has(file.path)) {
                    visible.push(file);
                } else {
                    others.push(file);
                }
            }
            
            return { visibleFiles: visible, otherFiles: others };
        } catch (error) {
            this.logger.error('分离可见文件失败:', error);
            // 出错时返回默认值
            return { visibleFiles: [], otherFiles: files };
        }
    }
    
    /**
     * 处理一批文件
     * 优先使用从服务容器获取的处理服务
     */
    private async processFilesBatch(files: TFile[]): Promise<void> {
        // 尝试从服务容器获取处理服务
        const processorService = this.getFileProcessorService();
        
        if (processorService && typeof processorService.processFile === 'function') {
            try {
                // 使用处理服务处理文件
                await Promise.all(
                    files.map(file => processorService.processFile(file))
                );
                return;
            } catch (error) {
                this.logger.error('使用处理服务批量处理文件失败:', error);
                // 出错时继续执行内部方法
            }
        }
        
        // 内部处理方法（备用）
        try {
            // 简单处理：读取文件前置元数据并尝试获取标题
            for (const file of files) {
                try {
                    const metadata = this.plugin?.app?.metadataCache?.getFileCache(file);
                    const title = metadata?.frontmatter?.title || file.basename;
                    // 在实际应用中，这里会将处理结果存储到缓存中
                    this.logger.debug(`处理文件 ${file.path}, 标题: ${title}`);
                } catch (e) {
                    this.logger.error(`处理文件 ${file.path} 失败:`, e);
                }
            }
        } catch (error) {
            this.logger.error('批量处理文件失败:', error);
        }
    }
    
    // 进度报告相关
    private progressReportingInterval: number | null = null;
    
    /**
     * 开始定期报告进度
     */
    private startProgressReporting(): void {
        this.stopProgressReporting(); // 确保先停止任何现有的报告
        
        // 每3秒报告一次进度
        this.progressReportingInterval = window.setInterval(() => {
            this.reportProgress();
        }, 3000);
        
        // 立即报告一次初始进度
        this.reportProgress();
    }
    
    /**
     * 停止进度报告
     */
    private stopProgressReporting(): void {
        if (this.progressReportingInterval !== null) {
            window.clearInterval(this.progressReportingInterval);
            this.progressReportingInterval = null;
        }
    }
    
    /**
     * 报告当前进度
     */
    private reportProgress(): void {
        const progress = this.getProgress();
        
        // 在控制台中显示进度条
        const progressBar = this.createProgressBar(progress);
        this.logger.info(`缓存预热进度: ${progress}% ${progressBar}`);
        
        // 发送进度事件
        try {
            window.dispatchEvent(new CustomEvent('filename-display:cache-warmup-progress', {
                detail: { progress, taskId: this.warmupTaskId }
            }));
        } catch (e) {
            // 忽略事件分发错误
        }
    }
    
    /**
     * 创建简单的ASCII进度条
     */
    private createProgressBar(percent: number, length: number = 20): string {
        const filledLength = Math.round(length * (percent / 100));
        const emptyLength = length - filledLength;
        
        const filled = '█'.repeat(filledLength);
        const empty = '░'.repeat(emptyLength);
        
        return `[${filled}${empty}]`;
    }
} 