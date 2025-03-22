/**
 * 简单的服务容器实现，用于管理依赖注入
 */
export class ServiceContainer {
    private static instance: ServiceContainer;
    private services: Map<string, any> = new Map();
    private factories: Map<string, () => any> = new Map();
    
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
     * 获取服务实例，如果不存在则通过工厂创建
     * @param key 服务标识符
     * @returns 服务实例
     */
    public get<T>(key: string): T {
        if (this.services.has(key)) {
            return this.services.get(key);
        }
        
        if (this.factories.has(key)) {
            const factory = this.factories.get(key);
            if (factory) {
                const instance = factory();
                this.services.set(key, instance);
                return instance;
            }
        }
        
        throw new Error(`服务未注册: ${key}`);
    }
    
    /**
     * 检查服务是否已注册
     * @param key 服务标识符
     */
    public has(key: string): boolean {
        return this.services.has(key) || this.factories.has(key);
    }
    
    /**
     * 清除所有注册的服务和工厂
     */
    public clear(): void {
        this.services.clear();
        this.factories.clear();
    }
} 