import { LRUCacheStrategy } from '../../../../src/services/cache/strategies/LRUCacheStrategy';
import { ICacheStorage, FileCacheItem } from '../../../../src/services/cache/interfaces';
import { ILoggerService } from '../../../../src/services/interfaces/IServices';

describe('LRUCacheStrategy', () => {
  let strategy: LRUCacheStrategy;
  let mockStorage: ICacheStorage<string, FileCacheItem>;
  let mockLogger: ILoggerService;
  
  // 创建一个工厂函数来生成模拟的缓存项
  const createMockItem = (accessCount: number, timestamp: number, priority: boolean = false): FileCacheItem => ({
    displayName: '测试显示名称',
    originalName: '测试原始名称.md',
    timestamp,
    mtime: timestamp,
    processed: true,
    links: new Set<string>(['link1', 'link2']),
    priority,
    accessCount,
    result: undefined
  });

  beforeEach(() => {
    // 创建模拟的日志服务
    mockLogger = {
      isDebugEnabled: jest.fn().mockReturnValue(true),
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      getLogger: jest.fn().mockReturnValue({}),
      dispose: jest.fn()
    };
    
    // 创建模拟的存储
    mockStorage = {
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      size: jest.fn(),
      keys: jest.fn(),
      values: jest.fn(),
      entries: jest.fn()
    };
    
    // 创建LRU策略实例
    strategy = new LRUCacheStrategy(mockLogger);
  });

  test('should return correct strategy name', () => {
    expect(strategy.getName()).toBe('LRU');
  });

  test('should update access count and timestamp', () => {
    const mockItem = createMockItem(5, Date.now() - 1000);
    const originalTimestamp = mockItem.timestamp;
    const originalAccessCount = mockItem.accessCount;
    
    strategy.update('test/path.md', mockItem);
    
    expect(mockItem.accessCount).toBe(originalAccessCount + 1);
    expect(mockItem.timestamp).toBeGreaterThan(originalTimestamp);
  });

  test('should not evict any items when count is zero or negative', () => {
    strategy.evict(mockStorage, 0);
    strategy.evict(mockStorage, -1);
    
    expect(mockStorage.delete).not.toHaveBeenCalled();
  });

  test('should not evict any items when storage is empty', () => {
    (mockStorage.size as jest.Mock).mockReturnValue(0);
    (mockStorage.entries as jest.Mock).mockReturnValue([]);
    
    strategy.evict(mockStorage, 5);
    
    expect(mockStorage.delete).not.toHaveBeenCalled();
  });

  test('should evict items based on access count and timestamp', () => {
    // 模拟缓存项，按照访问次数和时间戳排序
    const now = Date.now();
    const mockEntries = [
      ['file1.md', createMockItem(1, now - 5000)],     // 最少访问，较早
      ['file2.md', createMockItem(1, now - 3000)],     // 最少访问，较晚
      ['file3.md', createMockItem(2, now - 4000)],     // 中等访问
      ['file4.md', createMockItem(3, now - 2000)],     // 较多访问
      ['file5.md', createMockItem(1, now - 1000, true)] // 优先级高，不应被淘汰
    ];
    
    (mockStorage.size as jest.Mock).mockReturnValue(5);
    (mockStorage.entries as jest.Mock).mockReturnValue(mockEntries);
    
    // 测试淘汰2项
    strategy.evict(mockStorage, 2);
    
    // 验证应淘汰访问次数最少的两项
    expect(mockStorage.delete).toHaveBeenCalledTimes(2);
    expect(mockStorage.delete).toHaveBeenCalledWith('file1.md'); // 访问次数最少且最早
    expect(mockStorage.delete).toHaveBeenCalledWith('file2.md'); // 访问次数最少但较晚
  });

  test('should respect priority flag when evicting', () => {
    // 模拟缓存项，包括优先级项
    const now = Date.now();
    const mockEntries = [
      ['file1.md', createMockItem(1, now - 5000)],       // 普通项
      ['file2.md', createMockItem(1, now - 3000, true)], // 优先级项
      ['file3.md', createMockItem(2, now - 4000)],       // 普通项
      ['file4.md', createMockItem(3, now - 2000, true)], // 优先级项
      ['file5.md', createMockItem(1, now - 1000)]        // 普通项
    ];
    
    (mockStorage.size as jest.Mock).mockReturnValue(5);
    (mockStorage.entries as jest.Mock).mockReturnValue(mockEntries);
    
    // 测试淘汰3项
    strategy.evict(mockStorage, 3);
    
    // 验证只有非优先级项被淘汰
    expect(mockStorage.delete).toHaveBeenCalledTimes(3);
    expect(mockStorage.delete).toHaveBeenCalledWith('file1.md');
    expect(mockStorage.delete).toHaveBeenCalledWith('file3.md');
    expect(mockStorage.delete).toHaveBeenCalledWith('file5.md');
    expect(mockStorage.delete).not.toHaveBeenCalledWith('file2.md'); // 优先级项不应被淘汰
    expect(mockStorage.delete).not.toHaveBeenCalledWith('file4.md'); // 优先级项不应被淘汰
  });

  test('should evict at most available non-priority items', () => {
    // 模拟缓存项，包括优先级项
    const now = Date.now();
    const mockEntries = [
      ['file1.md', createMockItem(1, now - 5000)],       // 普通项
      ['file2.md', createMockItem(1, now - 3000, true)], // 优先级项
      ['file3.md', createMockItem(2, now - 4000)],       // 普通项
      ['file4.md', createMockItem(3, now - 2000, true)], // 优先级项
      ['file5.md', createMockItem(1, now - 1000)]        // 普通项
    ];
    
    (mockStorage.size as jest.Mock).mockReturnValue(5);
    (mockStorage.entries as jest.Mock).mockReturnValue(mockEntries);
    
    // 请求淘汰5项，但只有3项非优先级项可淘汰
    strategy.evict(mockStorage, 5);
    
    // 验证只淘汰了3项非优先级项
    expect(mockStorage.delete).toHaveBeenCalledTimes(3);
  });
}); 