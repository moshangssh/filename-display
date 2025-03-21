import { ICacheWarmer } from '../interfaces';
import { ILoggerService, ITimerService } from '../../interfaces/IServices';
import { TFile } from 'obsidian';
import { FileProcessorService } from '../../FileProcessorService';

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
     * @param fileProcessorService 文件处理服务
     */
    constructor(
        private plugin: any,
        private logger: ILoggerService,
        private timerService: ITimerService,
        private fileProcessorService: FileProcessorService
    ) {}
    
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
                const { visibleFiles, otherFiles } = this.fileProcessorService.separateFilesByVisibility(files);
                
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
                    await Promise.all(
                        batch.map(file => this.fileProcessorService.processFile(file))
                    );
                    
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
                                    await Promise.all(
                                        batch.map(file => this.fileProcessorService.processFile(file))
                                    );
                                    
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
            } catch (error) {
                this.logger.error('缓存预热失败:', error);
            } finally {
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
} 