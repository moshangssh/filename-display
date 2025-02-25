export function measurePerformance() {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            const start = performance.now();
            try {
                const result = await originalMethod.apply(this, args);
                const end = performance.now();
                console.log(`${propertyKey} 执行时间: ${(end - start).toFixed(2)}ms`);
                return result;
            } catch (error) {
                console.error(`${propertyKey} 执行失败:`, error);
                throw error;
            }
        };

        return descriptor;
    };
} 