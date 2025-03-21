// src/services/cache/interfaces/ICacheWarmer.ts
export interface ICacheWarmer {
    warmUp(): Promise<void>;
    cancel(): void;
    getProgress(): number;
    isWarming(): boolean;
} 