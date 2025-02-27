// 缓存清理Worker

interface CleanupMessage {
    keys: string[];
    expireTime: number;
    level: 'MEMORY' | 'DISK';
}

self.onmessage = (e: MessageEvent<CleanupMessage>) => {
    const { keys, expireTime, level } = e.data;
    const now = Date.now();
    
    // 查找过期的key
    const expiredKeys = keys.filter(key => {
        const timestamp = parseInt(key.split('_')[1] || '0');
        return (now - timestamp) > expireTime;
    });
    
    // 发送结果回主线程
    self.postMessage({
        expiredKeys,
        level
    });
}; 