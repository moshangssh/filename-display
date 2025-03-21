import { FileCacheStorage } from '../../src/services/cache/storage/FileCacheStorage';
import { WeakMapElementAssociator } from '../../src/services/cache/associator/WeakMapElementAssociator';
import { CacheMetadataManager } from '../../src/services/cache/metadata/CacheMetadataManager';
import { LRUCacheStrategy } from '../../src/services/cache/strategies/LRUCacheStrategy';
import { IPersistenceManager, CacheData, FileCacheItem } from '../../src/services/cache/interfaces';
import { ILoggerService } from '../../src/services/interfaces/IServices';

describe('Cache System Integration', () => {
  // 组件
  let storage: FileCacheStorage;
  let associator: WeakMapElementAssociator;
  let metadataManager: CacheMetadataManager;
  let strategy: LRUCacheStrategy;
  let mockPersistenceManager: IPersistenceManager<CacheData>;
  let mockLogger: ILoggerService;
  let testElement: HTMLElement;
  
  // 测试数据
  const testPath = 'test/document.md';
  const testDisplayName = '测试文档';
  const testOriginalName = 'document.md';
  
  beforeEach(() => {
    // 模拟日志服务
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
    
    // 模拟持久化管理器
    mockPersistenceManager = {
      load: jest.fn().mockResolvedValue({ fileCache: [] }),
      save: jest.fn().mockResolvedValue(undefined)
    };
    
    // 初始化组件
    storage = new FileCacheStorage();
    associator = new WeakMapElementAssociator();
    metadataManager = new CacheMetadataManager(storage);
    strategy = new LRUCacheStrategy(mockLogger);
    
    // 创建测试DOM元素
    testElement = document.createElement('div');
    document.body.appendChild(testElement);
  });
  
  afterEach(() => {
    // 清理DOM
    document.body.innerHTML = '';
  });
  
  test('should store, retrieve and manage cache items across components', () => {
    // 步骤1: 创建并存储缓存项
    const item: FileCacheItem = {
      displayName: testDisplayName,
      originalName: testOriginalName,
      timestamp: Date.now(),
      mtime: Date.now(),
      processed: true,
      links: new Set<string>(['link1', 'link2']),
      priority: false,
      accessCount: 0,
      result: { displayName: testDisplayName, success: true }
    };
    
    storage.set(testPath, item);
    
    // 步骤2: 验证存储成功
    expect(storage.has(testPath)).toBe(true);
    expect(storage.get(testPath)).toBe(item);
    
    // 步骤3: 通过元数据管理器更新访问状态
    metadataManager.updateAccessTime(testPath);
    metadataManager.incrementAccessCount(testPath);
    
    // 验证访问状态更新
    const updatedItem = storage.get(testPath);
    expect(updatedItem).toBeDefined();
    expect(updatedItem?.accessCount).toBe(1);
    
    // 步骤4: 通过策略更新访问状态
    strategy.update(testPath, item);
    expect(item.accessCount).toBe(2); // 再次递增
    
    // 步骤5: 关联DOM元素
    associator.associate(testElement, testPath, testOriginalName);
    
    // 验证关联成功
    const association = associator.getAssociation(testElement);
    expect(association).toBeDefined();
    expect(association?.path).toBe(testPath);
    expect(association?.originalName).toBe(testOriginalName);
    
    // 步骤6: 测试缓存淘汰策略
    // 添加更多项以便测试淘汰
    for (let i = 1; i <= 5; i++) {
      const newItem: FileCacheItem = {
        displayName: `测试${i}`,
        originalName: `test${i}.md`,
        timestamp: Date.now(),
        mtime: Date.now(),
        processed: true,
        links: new Set<string>(),
        priority: false,
        accessCount: 0,
        result: { displayName: `测试${i}`, success: true }
      };
      storage.set(`test/path${i}.md`, newItem);
    }
    
    // 验证缓存大小
    expect(storage.size()).toBe(6); // 原始项 + 5个新项
    
    // 执行淘汰
    strategy.evict(storage, 3);
    
    // 验证淘汰结果
    expect(storage.size()).toBe(3);
    expect(storage.has(testPath)).toBe(true); // 原始项应该保留，因为访问过
  });
  
  test('should handle expired items correctly', () => {
    // 创建两个项，一个普通，一个高优先级
    const normalItem: FileCacheItem = {
      displayName: '普通项',
      originalName: 'normal.md',
      timestamp: Date.now() - 6 * 60 * 1000, // 6分钟前(超过默认5分钟)
      mtime: Date.now(),
      processed: true,
      links: new Set<string>(),
      priority: false,
      accessCount: 0,
      result: { displayName: '普通项', success: true }
    };
    
    const priorityItem: FileCacheItem = {
      displayName: '优先级项',
      originalName: 'priority.md',
      timestamp: Date.now() - 20 * 60 * 1000, // 20分钟前(小于默认30分钟)
      mtime: Date.now(),
      processed: true,
      links: new Set<string>(),
      priority: true,
      accessCount: 0,
      result: { displayName: '优先级项', success: true }
    };
    
    // 存储项
    storage.set('normal.md', normalItem);
    storage.set('priority.md', priorityItem);
    
    // 验证过期状态
    expect(metadataManager.isExpired('normal.md')).toBe(true); // 普通项已过期
    expect(metadataManager.isExpired('priority.md')).toBe(false); // 优先级项未过期
    
    // 更新时间戳
    metadataManager.updateAccessTime('normal.md');
    
    // 验证更新后不再过期
    expect(metadataManager.isExpired('normal.md')).toBe(false);
  });
  
  test('should integrate with element association correctly', () => {
    // 创建多个元素和缓存项
    const elements: HTMLElement[] = [];
    const paths: string[] = [];
    
    for (let i = 0; i < 3; i++) {
      // 创建元素
      const element = document.createElement('div');
      document.body.appendChild(element);
      elements.push(element);
      
      // 创建路径
      const path = `test/file${i}.md`;
      paths.push(path);
      
      // 创建缓存项
      const item: FileCacheItem = {
        displayName: `测试${i}`,
        originalName: `file${i}.md`,
        timestamp: Date.now(),
        mtime: Date.now(),
        processed: true,
        links: new Set<string>(),
        priority: false,
        accessCount: 0,
        result: { displayName: `测试${i}`, success: true }
      };
      
      // 存储并关联
      storage.set(path, item);
      associator.associate(element, path, item.originalName);
    }
    
    // 验证存储和关联
    for (let i = 0; i < 3; i++) {
      expect(storage.has(paths[i])).toBe(true);
      const association = associator.getAssociation(elements[i]);
      expect(association).toBeDefined();
      expect(association?.path).toBe(paths[i]);
    }
    
    // 通过关联查找并更新缓存
    for (let i = 0; i < 3; i++) {
      const association = associator.getAssociation(elements[i]);
      if (association) {
        const item = storage.get(association.path);
        if (item) {
          metadataManager.incrementAccessCount(association.path);
        }
      }
    }
    
    // 验证更新结果
    for (let i = 0; i < 3; i++) {
      const item = storage.get(paths[i]);
      expect(item).toBeDefined();
      expect(item?.accessCount).toBe(1);
    }
  });
}); 