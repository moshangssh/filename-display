import { PerformanceTestRunner } from './PerformanceTestRunner';
import { ServiceContainer } from '../../src/core/ServiceContainer';
import { TFile } from 'obsidian';

// 添加 ResizeObserver 模拟
class MockResizeObserver {
    constructor(callback: ResizeObserverCallback) {
        // 简单的构造函数
    }

    observe(target: Element) {
        // 模拟观察方法
    }

    unobserve(target: Element) {
        // 模拟停止观察方法
    }

    disconnect() {
        // 模拟断开连接方法
    }
}

// 添加到全局
global.ResizeObserver = MockResizeObserver as any;

// 简单的模拟服务，仅用于绕过测试错误，不实现详细功能
const mockFilenameParser = {
    parseFilename: async () => ({ displayName: 'test', sourcePath: 'test', cssClasses: [] }),
    shouldProcess: () => true,
    isFileInEnabledFolder: () => true,
    getDisplayNameFromMetadata: () => 'test',
    extractDisplayName: () => 'test',
    dispose: () => {}
};

// 模拟并支持Jest监控
const mockFileDisplayCache = {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    has: jest.fn().mockReturnValue(false),
    delete: jest.fn().mockReturnValue(true),
    clear: jest.fn(),
    deletePath: jest.fn(),
    clearAll: jest.fn(),
    getDisplayName: jest.fn().mockReturnValue(undefined),
    setDisplayName: jest.fn(),
    addRecentFile: jest.fn(),
    getRecentFiles: jest.fn().mockReturnValue([]),
    getTargetElements: jest.fn().mockReturnValue([]),
    watchFile: jest.fn(),
    unwatchFile: jest.fn(),
    watchAllFiles: jest.fn(),
    unwatchAllFiles: jest.fn(),
    resetWatches: jest.fn(),
    getCachedDisplayResult: jest.fn().mockReturnValue(null),
    setCachedDisplayResult: jest.fn(),
    hasCachedDisplayResult: jest.fn().mockReturnValue(false),
    invalidateCache: jest.fn(),
    invalidatePath: jest.fn(),
    onCacheUpdate: jest.fn(),
    dispose: jest.fn()
};

const mockLoggerService = {
    isDebugEnabled: () => false,
    getLogger: () => mockLoggerService,
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    log: () => {},
    dispose: () => {}
};

// 注册基本服务
const container = ServiceContainer.getInstance();
if (!container.has('filenameParser')) {
    container.register('filenameParser', mockFilenameParser);
}
if (!container.has('fileDisplayCache')) {
    container.register('fileDisplayCache', mockFileDisplayCache);
}
if (!container.has('loggerService')) {
    container.register('loggerService', mockLoggerService);
}

// 在每次测试运行前清理性能测试报告
beforeAll(() => {
    const runner = PerformanceTestRunner.getInstance();
    runner.clearReports();
});

// 设置全局超时时间
jest.setTimeout(30000); // 30秒

// 禁用控制台输出（可选）
// console.log = jest.fn();
// console.warn = jest.fn();
// console.error = jest.fn(); 