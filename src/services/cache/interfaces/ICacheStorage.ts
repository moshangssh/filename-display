// src/services/cache/interfaces/ICacheStorage.ts
export interface ICacheStorage<K, V> {
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    has(key: K): boolean;
    delete(key: K): void;
    clear(): void;
    size(): number;
    keys(): K[];
    values(): V[];
    entries(): [K, V][];
} 