// src/services/cache/interfaces/ICacheMetadataManager.ts
export interface ICacheMetadataManager {
    updateAccessTime(key: string): void;
    incrementAccessCount(key: string): void;
    setPriority(key: string, isPriority: boolean): void;
    isExpired(key: string): boolean;
} 