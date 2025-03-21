import { ICacheStorage } from './ICacheStorage';

export interface ICacheStrategy<K, V> {
    evict(storage: ICacheStorage<K, V>, count: number): void;
    update(key: K, value: V): void;
    getName(): string;
} 