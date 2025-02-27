/**
 * 文件扫描 Worker
 * 负责在后台执行文件索引和预构建工作
 */

interface ScanMessage {
    type: 'scan';
    data: {
        folderPath: string;
    };
}

interface ProgressMessage {
    type: 'progress';
    data: string;
}

type WorkerMessage = ScanMessage;
type WorkerResponse = ProgressMessage;

// Worker 上下文
const ctx: Worker = self as any;

// 文件索引缓存
const fileIndex = new Map<string, {
    path: string;
    lastModified: number;
}>();

/**
 * 处理文件扫描请求
 */
async function handleScan(data: ScanMessage['data']) {
    try {
        ctx.postMessage({
            type: 'progress',
            data: `开始扫描文件夹: ${data.folderPath}`
        });

        // TODO: 实现实际的文件扫描逻辑
        // 由于 Worker 无法直接访问文件系统
        // 这里需要通过主线程传递文件信息

        ctx.postMessage({
            type: 'progress',
            data: '扫描完成'
        });
    } catch (error) {
        ctx.postMessage({
            type: 'progress',
            data: `扫描出错: ${error.message}`
        });
    }
}

// 监听消息
ctx.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'scan':
            handleScan(data);
            break;
        default:
            console.error('未知的消息类型:', type);
    }
}; 