import { TFile } from 'obsidian';
import { 
    errorHandler, 
    ErrorLevel 
} from '../utils';
import { IFilenameDisplayPlugin } from '../types';

/**
 * 错误处理示例服务，展示如何使用统一的错误处理机制
 * 这是一个演示类，用于展示各种错误处理技术
 */
export class ErrorHandlingExampleService {
    private plugin: IFilenameDisplayPlugin;
    
    constructor(plugin: IFilenameDisplayPlugin) {
        this.plugin = plugin;
        this.setupErrorHandling();
    }
    
    /**
     * 设置错误处理包装
     */
    private setupErrorHandling(): void {
        // 包装函数方法进行错误处理
        this.processFile = errorHandler.wrapWithErrorHandler(
            this.processFile.bind(this),
            { source: 'ErrorHandlingExampleService' },
            'processFile'
        );
        
        // 包装异步方法并添加重试功能
        // 这里使用了自定义重试逻辑，也可以直接使用 errorHandler.wrapWithAsyncErrorHandler
        const originalFetchFileData = this.fetchFileData.bind(this);
        this.fetchFileData = async (filePath: string): Promise<string> => {
            const maxRetries = 3;
            const delayMs = 500;
            let lastError: unknown;
            
            for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
                try {
                    return await originalFetchFileData(filePath);
                } catch (error) {
                    lastError = error;
                    
                    if (attempt <= maxRetries) {
                        // 记录警告但继续重试
                        errorHandler.captureError(error, {
                            source: 'ErrorHandlingExampleService',
                            operation: `fetchFileData (尝试 ${attempt}/${maxRetries + 1})`,
                            data: { filePath }
                        }, ErrorLevel.WARNING);
                        
                        // 等待指定时间后重试
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                }
            }
            
            // 所有重试都失败，记录最终错误
            errorHandler.captureError(lastError, {
                source: 'ErrorHandlingExampleService',
                operation: `fetchFileData (所有尝试都失败)`,
                data: { filePath }
            }, ErrorLevel.ERROR);
            
            // 所有尝试失败后返回默认值
            return '获取失败';
        };
        
        // 包装异步方法并添加执行时间记录
        const originalProcessLargeFile = this.processLargeFile.bind(this);
        this.processLargeFile = async (file: TFile): Promise<void> => {
            const start = performance.now();
            try {
                return await originalProcessLargeFile(file);
            } finally {
                const duration = performance.now() - start;
                const level = duration > 500 ? ErrorLevel.WARNING : ErrorLevel.INFO;
                
                errorHandler.captureError(`执行时间: ${duration.toFixed(2)}ms`, {
                    source: 'ErrorHandlingExampleService',
                    operation: `processLargeFile 执行时间`,
                    data: { duration, file }
                }, level);
            }
        };
    }
    
    /**
     * 处理文件的方法（将被错误处理包装）
     */
    public processFile(file: TFile): string {
        // 这里可能会抛出错误，但会被错误处理器捕获并记录
        if (!file) {
            throw new Error('文件为空');
        }
        
        return file.basename;
    }
    
    /**
     * 获取文件数据的异步方法（将被错误处理包装及重试）
     */
    public async fetchFileData(filePath: string): Promise<string> {
        // 模拟可能失败的异步操作，会自动重试
        if (Math.random() > 0.7) {
            throw new Error('网络请求失败');
        }
        
        return '文件数据';
    }
    
    /**
     * 处理大文件的方法（将被执行时间记录包装）
     */
    public async processLargeFile(file: TFile): Promise<void> {
        // 模拟耗时操作
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
    }
    
    /**
     * 手动使用errorHandler包装方法的示例
     */
    public safelyProcessFiles(files: TFile[]): string[] {
        return errorHandler.tryOrDefault(
            () => {
                if (!files || files.length === 0) {
                    throw new Error('文件列表为空');
                }
                
                return files.map(file => file.basename);
            },
            [], // 出错时返回空数组
            {
                source: 'ErrorHandlingExampleService',
                operation: 'safelyProcessFiles'
            }
        );
    }
    
    /**
     * 异步方法使用手动错误处理的示例
     */
    public async safelyProcessFilesAsync(files: TFile[]): Promise<string[]> {
        return await errorHandler.tryOrDefaultAsync(
            async () => {
                if (!files || files.length === 0) {
                    throw new Error('文件列表为空');
                }
                
                // 模拟异步处理
                await new Promise(resolve => setTimeout(resolve, 100));
                
                return files.map(file => file.basename);
            },
            [], // 出错时返回空数组
            {
                source: 'ErrorHandlingExampleService',
                operation: 'safelyProcessFilesAsync'
            }
        );
    }
    
    /**
     * 使用包装函数进行错误处理的示例
     */
    public init(): void {
        // 创建带错误处理的函数包装器
        const safeCallback = errorHandler.wrapWithErrorHandler(
            (event: Event) => {
                // 可能会抛出错误的代码
                if (!event) {
                    throw new Error('事件对象为空');
                }
                console.log('处理事件', event.type);
            },
            {
                source: 'ErrorHandlingExampleService'
            },
            'eventHandler'
        );
        
        // 可以安全地使用包装后的回调函数
        document.addEventListener('click', safeCallback);
    }
    
    /**
     * 异步函数包装示例
     */
    public setupAsync(): void {
        // 创建带错误处理的异步函数包装器
        const safeAsyncCallback = errorHandler.wrapWithAsyncErrorHandler(
            async (data: any) => {
                // 可能会抛出错误的异步代码
                if (!data) {
                    throw new Error('数据为空');
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
                return 'success';
            },
            {
                source: 'ErrorHandlingExampleService'
            },
            'asyncEventHandler'
        );
        
        // 可以安全地使用包装后的异步回调函数
        safeAsyncCallback({ test: 'data' })
            .then(result => console.log('处理完成', result));
    }
} 