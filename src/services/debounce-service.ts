export class DebounceService {
    private timeouts: Map<string, NodeJS.Timeout> = new Map();

    debounce<T extends (...args: any[]) => void>(
        key: string,
        func: T,
        wait: number
    ): (...args: Parameters<T>) => void {
        return (...args: Parameters<T>) => {
            const existing = this.timeouts.get(key);
            if (existing) {
                clearTimeout(existing);
            }

            const timeout = setTimeout(() => {
                func.apply(null, args);
                this.timeouts.delete(key);
            }, wait);

            this.timeouts.set(key, timeout);
        };
    }

    clearAll(): void {
        this.timeouts.forEach(timeout => clearTimeout(timeout));
        this.timeouts.clear();
    }
}
