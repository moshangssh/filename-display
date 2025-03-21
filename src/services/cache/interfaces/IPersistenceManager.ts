export interface IPersistenceManager<T> {
    save(data: T): Promise<void>;
    load(): Promise<T | undefined>;
} 