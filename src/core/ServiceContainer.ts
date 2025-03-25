/**
 * 简单的服务容器实现，用于管理依赖注入
 */
export class ServiceContainer {
    private static instance: ServiceContainer;
    private services: Map<string, any> = new Map();
    private factories: Map<string, () => any> = new Map();
    private parameterizedFactories: Map<string, (...args: any[]) => any> = new Map();
    private dependencyCallbacks: Map<string, Function[]> = new Map();
    private pendingResolves: Set<string> = new Set();
    
    private constructor() {}
    
    /**
     * 获取ServiceContainer的单例实例
     */
    public static getInstance(): ServiceContainer {
        if (!ServiceContainer.instance) {
            ServiceContainer.instance = new ServiceContainer();
        }
        return ServiceContainer.instance;
    }
    
    /**
     * 注册一个服务实例
     * @param key 服务标识符
     * @param instance 服务实例
     */
    public register<T>(key: string, instance: T): void {
        this.services.set(key, instance);
        this.notifyCallbacks(key, instance);
    }
    
    /**
     * 注册一个服务工厂函数，在需要时懒加载服务
     * @param key 服务标识符
     * @param factory 创建服务实例的工厂函数
     */
    public registerFactory<T>(key: string, factory: () => T): void {
        this.factories.set(key, factory);
    }
    
    /**
     * 注册一个带参数的服务工厂函数
     * @param key 服务标识符
     * @param factory 接受参数的工厂函数
     */
    public registerParameterizedFactory<T>(key: string, factory: (...args: any[]) => T): void {
        this.parameterizedFactories.set(key, factory);
    }
    
    /**
     * 添加服务解析的回调函数
     * @param key 服务标识符
     * @param callback 当服务被解析时调用的回调函数
     */
    public onResolve<T>(key: string, callback: (service: T) => void): void {
        if (!this.dependencyCallbacks.has(key)) {
            this.dependencyCallbacks.set(key, []);
        }
        
        const callbacks = this.dependencyCallbacks.get(key)!;
        callbacks.push(callback);
        
        // 如果服务已经存在，立即调用回调
        if (this.services.has(key)) {
            callback(this.services.get(key));
        }
    }
    
    /**
     * 获取服务实例，如果不存在则通过工厂创建
     * @param key 服务标识符
     * @returns 服务实例
     */
    public get<T>(key: string): T {
        // 检测循环依赖
        if (this.pendingResolves.has(key)) {
            throw new Error(`检测到循环依赖: ${Array.from(this.pendingResolves).join(' -> ')} -> ${key}`);
        }
        
        if (this.services.has(key)) {
            return this.services.get(key);
        }
        
        // 标记正在解析此服务
        this.pendingResolves.add(key);
        
        try {
            if (this.factories.has(key)) {
                const factory = this.factories.get(key);
                if (factory) {
                    const instance = factory();
                    this.services.set(key, instance);
                    this.notifyCallbacks(key, instance);
                    return instance;
                }
            }
            
            throw new Error(`服务未注册: ${key}`);
        } finally {
            // 解析完成，移除标记
            this.pendingResolves.delete(key);
        }
    }
    
    /**
     * 使用带参数的工厂函数创建服务实例
     * @param key 服务标识符
     * @param args 传递给工厂函数的参数
     * @returns 新创建的服务实例
     */
    public createWithParams<T>(key: string, ...args: any[]): T {
        if (this.parameterizedFactories.has(key)) {
            const factory = this.parameterizedFactories.get(key)!;
            return factory(...args);
        }
        
        throw new Error(`参数化工厂未注册: ${key}`);
    }
    
    /**
     * 检查服务是否已注册
     * @param key 服务标识符
     */
    public has(key: string): boolean {
        return this.services.has(key) || this.factories.has(key) || this.parameterizedFactories.has(key);
    }
    
    /**
     * 清除所有注册的服务和工厂
     */
    public clear(): void {
        this.services.clear();
        this.factories.clear();
        this.parameterizedFactories.clear();
        this.dependencyCallbacks.clear();
    }
    
    /**
     * 通知依赖回调
     */
    private notifyCallbacks(key: string, instance: any): void {
        const callbacks = this.dependencyCallbacks.get(key);
        if (callbacks && callbacks.length > 0) {
            for (const callback of callbacks) {
                try {
                    callback(instance);
                } catch (error) {
                    console.error(`执行服务 ${key} 的回调时出错:`, error);
                }
            }
        }
    }
} 