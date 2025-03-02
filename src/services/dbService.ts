import { log } from '../utils/helpers';

/**
 * IndexedDB 数据库服务
 * 用于存储和检索预编译的正则表达式
 */
export class DBService {
    private static instance: DBService;
    private db: IDBDatabase | null = null;
    private readonly DB_NAME = 'obsidian-filename-display';
    private readonly STORE_NAME = 'regex-patterns';
    private readonly DB_VERSION = 1;
    private isInitializing = false;
    private initPromise: Promise<boolean> | null = null;

    private constructor() {
        // 单例模式
    }

    /**
     * 获取单例实例
     */
    public static getInstance(): DBService {
        if (!DBService.instance) {
            DBService.instance = new DBService();
        }
        return DBService.instance;
    }

    /**
     * 初始化数据库连接
     * @returns 是否成功初始化
     */
    public async init(): Promise<boolean> {
        if (this.db) {
            return true;
        }

        if (this.isInitializing) {
            return this.initPromise as Promise<boolean>;
        }

        this.isInitializing = true;
        this.initPromise = new Promise<boolean>((resolve) => {
            try {
                const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

                request.onerror = (event) => {
                    log('IndexedDB 打开失败', event, true);
                    this.isInitializing = false;
                    resolve(false);
                };

                request.onsuccess = (event) => {
                    this.db = (event.target as IDBOpenDBRequest).result;
                    this.isInitializing = false;
                    log('IndexedDB 连接成功');
                    resolve(true);
                };

                request.onupgradeneeded = (event) => {
                    const db = (event.target as IDBOpenDBRequest).result;
                    
                    // 创建对象仓库
                    if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                        const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                        // 创建索引
                        store.createIndex('pattern', 'pattern', { unique: false });
                        store.createIndex('lastUsed', 'lastUsed', { unique: false });
                        log('创建 IndexedDB 对象仓库');
                    }
                };
            } catch (error) {
                log('初始化 IndexedDB 失败', error, true);
                this.isInitializing = false;
                resolve(false);
            }
        });

        return this.initPromise;
    }

    /**
     * 存储正则表达式模式
     * @param pattern 正则表达式模式
     * @param flags 正则表达式标志
     * @returns 是否成功存储
     */
    public async storeRegexPattern(pattern: string, flags?: string): Promise<boolean> {
        if (!await this.init()) {
            return false;
        }

        return new Promise<boolean>((resolve) => {
            try {
                const key = flags ? `${pattern}:${flags}` : pattern;
                const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);

                const data = {
                    id: key,
                    pattern: pattern,
                    flags: flags || '',
                    lastUsed: Date.now(),
                    useCount: 1
                };

                // 先检查是否存在
                const getRequest = store.get(key);
                
                getRequest.onsuccess = (event) => {
                    const existingData = (event.target as IDBRequest).result;
                    
                    if (existingData) {
                        // 更新使用次数和最后使用时间
                        data.useCount = existingData.useCount + 1;
                    }
                    
                    const request = store.put(data);
                    
                    request.onsuccess = () => {
                        resolve(true);
                    };
                    
                    request.onerror = (error) => {
                        log('存储正则表达式失败', error, true);
                        resolve(false);
                    };
                };
                
                getRequest.onerror = (error) => {
                    log('查询正则表达式失败', error, true);
                    resolve(false);
                };
            } catch (error) {
                log('存储正则表达式出错', error, true);
                resolve(false);
            }
        });
    }

    /**
     * 获取正则表达式模式
     * @param pattern 正则表达式模式
     * @param flags 正则表达式标志
     * @returns 正则表达式数据
     */
    public async getRegexPattern(pattern: string, flags?: string): Promise<{ pattern: string, flags: string } | null> {
        if (!await this.init()) {
            return null;
        }

        return new Promise<{ pattern: string, flags: string } | null>((resolve) => {
            try {
                const key = flags ? `${pattern}:${flags}` : pattern;
                const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.get(key);

                request.onsuccess = (event) => {
                    const data = (event.target as IDBRequest).result;
                    if (data) {
                        // 异步更新使用次数和最后使用时间
                        this.updateUsageStats(key);
                        resolve({ pattern: data.pattern, flags: data.flags });
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = (error) => {
                    log('获取正则表达式失败', error, true);
                    resolve(null);
                };
            } catch (error) {
                log('获取正则表达式出错', error, true);
                resolve(null);
            }
        });
    }

    /**
     * 更新使用统计
     * @param key 存储键
     */
    private async updateUsageStats(key: string): Promise<void> {
        try {
            const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.get(key);

            request.onsuccess = (event) => {
                const data = (event.target as IDBRequest).result;
                if (data) {
                    data.lastUsed = Date.now();
                    data.useCount++;
                    store.put(data);
                }
            };
        } catch (error) {
            log('更新使用统计失败', error, true);
        }
    }

    /**
     * 获取最常用的正则表达式模式
     * @param limit 限制数量
     * @returns 正则表达式模式列表
     */
    public async getMostUsedPatterns(limit: number = 10): Promise<Array<{ pattern: string, flags: string, useCount: number }>> {
        if (!await this.init()) {
            return [];
        }

        return new Promise<Array<{ pattern: string, flags: string, useCount: number }>>((resolve) => {
            try {
                const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.index('lastUsed').openCursor(null, 'prev');
                
                const patterns: Array<{ pattern: string, flags: string, useCount: number }> = [];

                request.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
                    if (cursor && patterns.length < limit) {
                        patterns.push({
                            pattern: cursor.value.pattern,
                            flags: cursor.value.flags,
                            useCount: cursor.value.useCount
                        });
                        cursor.continue();
                    } else {
                        // 按使用次数排序
                        patterns.sort((a, b) => b.useCount - a.useCount);
                        resolve(patterns);
                    }
                };

                request.onerror = (error) => {
                    log('获取常用正则表达式失败', error, true);
                    resolve([]);
                };
            } catch (error) {
                log('获取常用正则表达式出错', error, true);
                resolve([]);
            }
        });
    }

    /**
     * 清空数据库
     */
    public async clear(): Promise<boolean> {
        if (!await this.init()) {
            return false;
        }

        return new Promise<boolean>((resolve) => {
            try {
                const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
                const store = transaction.objectStore(this.STORE_NAME);
                const request = store.clear();

                request.onsuccess = () => {
                    resolve(true);
                };

                request.onerror = (error) => {
                    log('清空数据库失败', error, true);
                    resolve(false);
                };
            } catch (error) {
                log('清空数据库出错', error, true);
                resolve(false);
            }
        });
    }

    /**
     * 关闭数据库连接
     */
    public close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
} 