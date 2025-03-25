export class DependencyTracker {
    private static dependencies: Map<string, string[]> = new Map();
    
    static addDependency(from: string, to: string): void {
        if (!this.dependencies.has(from)) {
            this.dependencies.set(from, []);
        }
        this.dependencies.get(from)?.push(to);
    }
    
    static logDependencies(): void {
        console.log("当前依赖关系图:");
        this.dependencies.forEach((deps, module) => {
            console.log(`${module} 依赖于: ${deps.join(', ')}`);
        });
    }
} 