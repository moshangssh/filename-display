import { ServiceContainer } from './ServiceContainer';

/**
 * 依赖关系解析器
 * 用于辅助解析服务之间的依赖关系，避免循环依赖问题
 */
export class DependencyResolver {
    private serviceContainer: ServiceContainer;
    
    /**
     * 构造函数
     */
    constructor() {
        this.serviceContainer = ServiceContainer.getInstance();
    }
    
    /**
     * 解析创建服务所需的依赖项
     * @param dependencies 依赖项的标识符数组
     * @returns 解析后的依赖项数组
     */
    public resolveDependencies(dependencies: string[]): any[] {
        return dependencies.map(dep => {
            if (this.serviceContainer.has(dep)) {
                return this.serviceContainer.get(dep);
            }
            return undefined;
        });
    }
    
    /**
     * 注册服务创建工厂函数，并自动注入依赖
     * @param serviceKey 服务标识符
     * @param dependencies 依赖项的标识符数组
     * @param factory 创建服务的工厂函数
     */
    public registerWithDependencies<T>(
        serviceKey: string,
        dependencies: string[],
        factory: (...deps: any[]) => T
    ): void {
        this.serviceContainer.registerFactory(serviceKey, () => {
            const resolvedDeps = this.resolveDependencies(dependencies);
            return factory(...resolvedDeps);
        });
    }
    
    /**
     * 等待所有依赖项就绪后执行回调
     * @param dependencies 依赖项的标识符数组
     * @param callback 依赖项就绪后执行的回调函数
     */
    public whenReady(dependencies: string[], callback: (...services: any[]) => void): void {
        let resolvedCount = 0;
        const resolved: any[] = new Array(dependencies.length).fill(undefined);
        
        dependencies.forEach((dep, index) => {
            // 如果服务已存在，立即记录
            if (this.serviceContainer.has(dep) && this.serviceContainer.get(dep)) {
                resolved[index] = this.serviceContainer.get(dep);
                resolvedCount++;
                
                // 如果所有依赖都解析完毕，执行回调
                if (resolvedCount === dependencies.length) {
                    callback(...resolved);
                }
                return;
            }
            
            // 否则注册回调等待服务就绪
            this.serviceContainer.onResolve(dep, (service) => {
                resolved[index] = service;
                resolvedCount++;
                
                // 如果所有依赖都解析完毕，执行回调
                if (resolvedCount === dependencies.length) {
                    callback(...resolved);
                }
            });
        });
    }
    
    /**
     * 检查服务之间是否有循环依赖
     * @param services 服务标识符数组
     * @returns 依赖图对象，包含直接依赖和间接依赖
     */
    public analyzeDependencies(services: string[]): { [key: string]: string[] } {
        const directDeps: { [key: string]: string[] } = {};
        
        // 构建直接依赖关系图
        services.forEach(service => {
            if (!directDeps[service]) {
                directDeps[service] = [];
            }
            
            // 添加服务的直接依赖项
            // 这里需要根据实际代码组织方式收集依赖关系
            // 例如，可以通过注入依赖时收集依赖关系
        });
        
        return directDeps;
    }
} 