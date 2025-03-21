import { CacheMetadataManager } from '../../../../src/services/cache/metadata/CacheMetadataManager';
import { ICacheStorage, FileCacheItem } from '../../../../src/services/cache/interfaces';

describe('CacheMetadataManager', () => {
  let metadataManager: CacheMetadataManager;
  let mockStorage: ICacheStorage<string, FileCacheItem>;
  let mockCacheItem: FileCacheItem;
  let mockKey: string;
  
  beforeEach(() => {
    // 设置模拟存储和模拟缓存项
    mockKey = 'test/path.md';
    mockCacheItem = {
      displayName: '测试显示名称',
      originalName: '测试原始名称.md',
      timestamp: Date.now() - 60000, // 1分钟前的时间戳
      mtime: Date.now() - 60000,
      processed: true,
      links: new Set<string>(['link1', 'link2']),
      priority: false,
      accessCount: 5,
      result: undefined
    };
    
    // 创建模拟的存储
    mockStorage = {
      get: jest.fn().mockImplementation((key) => key === mockKey ? mockCacheItem : undefined),
      set: jest.fn(),
      has: jest.fn().mockImplementation((key) => key === mockKey),
      delete: jest.fn(),
      clear: jest.fn(),
      size: jest.fn().mockReturnValue(1),
      keys: jest.fn().mockReturnValue([mockKey]),
      values: jest.fn().mockReturnValue([mockCacheItem]),
      entries: jest.fn().mockReturnValue([[mockKey, mockCacheItem]])
    };
    
    // 创建元数据管理器实例
    metadataManager = new CacheMetadataManager(mockStorage);
  });
  
  test('should update access time', () => {
    const originalTimestamp = mockCacheItem.timestamp;
    
    metadataManager.updateAccessTime(mockKey);
    
    expect(mockStorage.get).toHaveBeenCalledWith(mockKey);
    expect(mockCacheItem.timestamp).toBeGreaterThan(originalTimestamp);
  });
  
  test('should not update access time for non-existent items', () => {
    metadataManager.updateAccessTime('non/existent.md');
    
    expect(mockStorage.get).toHaveBeenCalledWith('non/existent.md');
    // 没有对不存在的项进行处理，不应抛出错误
  });
  
  test('should increment access count', () => {
    const originalAccessCount = mockCacheItem.accessCount;
    
    metadataManager.incrementAccessCount(mockKey);
    
    expect(mockStorage.get).toHaveBeenCalledWith(mockKey);
    expect(mockCacheItem.accessCount).toBe(originalAccessCount + 1);
  });
  
  test('should not increment access count for non-existent items', () => {
    metadataManager.incrementAccessCount('non/existent.md');
    
    expect(mockStorage.get).toHaveBeenCalledWith('non/existent.md');
    // 没有对不存在的项进行处理，不应抛出错误
  });
  
  test('should set priority flag', () => {
    // 初始为false
    expect(mockCacheItem.priority).toBe(false);
    
    // 设置为true
    metadataManager.setPriority(mockKey, true);
    expect(mockStorage.get).toHaveBeenCalledWith(mockKey);
    expect(mockCacheItem.priority).toBe(true);
    
    // 再设置为false
    metadataManager.setPriority(mockKey, false);
    expect(mockCacheItem.priority).toBe(false);
  });
  
  test('should not set priority for non-existent items', () => {
    metadataManager.setPriority('non/existent.md', true);
    
    expect(mockStorage.get).toHaveBeenCalledWith('non/existent.md');
    // 没有对不存在的项进行处理，不应抛出错误
  });
  
  test('should correctly determine if normal items are expired', () => {
    // 创建模拟Date.now函数，以便控制"当前时间"
    const originalNow = Date.now;
    
    try {
      // 测试普通项：5分钟内未过期
      const itemTime = Date.now();
      mockCacheItem.timestamp = itemTime;
      mockCacheItem.priority = false;
      
      // 当前时间 = 项时间 + 4分钟59秒
      Date.now = jest.fn().mockReturnValue(itemTime + 4 * 60 * 1000 + 59 * 1000);
      expect(metadataManager.isExpired(mockKey)).toBe(false);
      
      // 当前时间 = 项时间 + 5分钟1秒 (应过期)
      Date.now = jest.fn().mockReturnValue(itemTime + 5 * 60 * 1000 + 1000);
      expect(metadataManager.isExpired(mockKey)).toBe(true);
    } finally {
      // 恢复原始Date.now
      Date.now = originalNow;
    }
  });
  
  test('should correctly determine if priority items are expired', () => {
    // 创建模拟Date.now函数，以便控制"当前时间"
    const originalNow = Date.now;
    
    try {
      // 测试高优先级项：30分钟内未过期
      const itemTime = Date.now();
      mockCacheItem.timestamp = itemTime;
      mockCacheItem.priority = true;
      
      // 当前时间 = 项时间 + 29分钟59秒
      Date.now = jest.fn().mockReturnValue(itemTime + 29 * 60 * 1000 + 59 * 1000);
      expect(metadataManager.isExpired(mockKey)).toBe(false);
      
      // 当前时间 = 项时间 + 30分钟1秒 (应过期)
      Date.now = jest.fn().mockReturnValue(itemTime + 30 * 60 * 1000 + 1000);
      expect(metadataManager.isExpired(mockKey)).toBe(true);
    } finally {
      // 恢复原始Date.now
      Date.now = originalNow;
    }
  });
  
  test('should return true for isExpired on non-existent items', () => {
    expect(metadataManager.isExpired('non/existent.md')).toBe(true);
    expect(mockStorage.get).toHaveBeenCalledWith('non/existent.md');
  });
  
  test('should allow setting custom expiry times', () => {
    // 创建模拟Date.now函数，以便控制"当前时间"
    const originalNow = Date.now;
    
    try {
      // 设置自定义过期时间：普通项2分钟，高优先级项10分钟
      (metadataManager as any).setExpiryTimes(2 * 60 * 1000, 10 * 60 * 1000);
      
      const itemTime = Date.now();
      mockCacheItem.timestamp = itemTime;
      
      // 测试普通项：2分钟内未过期
      mockCacheItem.priority = false;
      // 当前时间 = 项时间 + 1分钟59秒
      Date.now = jest.fn().mockReturnValue(itemTime + 1 * 60 * 1000 + 59 * 1000);
      expect(metadataManager.isExpired(mockKey)).toBe(false);
      // 当前时间 = 项时间 + 2分钟1秒 (应过期)
      Date.now = jest.fn().mockReturnValue(itemTime + 2 * 60 * 1000 + 1000);
      expect(metadataManager.isExpired(mockKey)).toBe(true);
      
      // 测试高优先级项：10分钟内未过期
      mockCacheItem.priority = true;
      // 当前时间 = 项时间 + 9分钟59秒
      Date.now = jest.fn().mockReturnValue(itemTime + 9 * 60 * 1000 + 59 * 1000);
      expect(metadataManager.isExpired(mockKey)).toBe(false);
      // 当前时间 = 项时间 + 10分钟1秒 (应过期)
      Date.now = jest.fn().mockReturnValue(itemTime + 10 * 60 * 1000 + 1000);
      expect(metadataManager.isExpired(mockKey)).toBe(true);
    } finally {
      // 恢复原始Date.now
      Date.now = originalNow;
    }
  });
}); 