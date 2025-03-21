import { FileCacheStorage } from '../../src/services/cache/storage/FileCacheStorage';
import { WeakMapElementAssociator } from '../../src/services/cache/associator/WeakMapElementAssociator';
import { CacheMetadataManager } from '../../src/services/cache/metadata/CacheMetadataManager';
import { LRUCacheStrategy } from '../../src/services/cache/strategies/LRUCacheStrategy';
import { FileCacheItem } from '../../src/services/cache/interfaces';
import { ILoggerService } from '../../src/services/interfaces/IServices';

describe('缓存系统性能测试', () => {
  // 组件
  let storage: FileCacheStorage;
  let associator: WeakMapElementAssociator;
  let metadataManager: CacheMetadataManager;
  let strategy: LRUCacheStrategy;
  let mockLogger: ILoggerService;
  
  // 测试数据
  const ITEM_COUNT = 1000; // 减少缓存项数量，以便测试更快完成
  
  beforeAll(() => {
    // 在所有测试开始前输出一条消息
    process.stdout.write('\n开始性能测试...\n');
  });
  
  beforeEach(() => {
    // 模拟日志服务
    mockLogger = {
      isDebugEnabled: jest.fn().mockReturnValue(false), // 关闭调试日志以减少开销
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      getLogger: jest.fn().mockReturnValue({}),
      dispose: jest.fn()
    };
    
    // 初始化组件
    storage = new FileCacheStorage();
    associator = new WeakMapElementAssociator();
    metadataManager = new CacheMetadataManager(storage);
    strategy = new LRUCacheStrategy(mockLogger);
  });
  
  // 生成测试缓存项
  function createCacheItem(id: number): FileCacheItem {
    return {
      displayName: `测试文档 ${id}`,
      originalName: `document${id}.md`,
      timestamp: Date.now() - Math.floor(Math.random() * 3600000), // 随机时间戳
      mtime: Date.now(),
      processed: true,
      links: new Set<string>([`link${id}_1`, `link${id}_2`]),
      priority: id % 10 === 0, // 每10个项中有一个是高优先级
      accessCount: Math.floor(Math.random() * 20), // 随机访问次数
      result: { displayName: `测试文档 ${id}`, success: true }
    };
  }
  
  test('存储性能测试', () => {
    const start = performance.now();
    
    // 插入数据
    for (let i = 0; i < ITEM_COUNT; i++) {
      const path = `test/path${i}.md`;
      storage.set(path, createCacheItem(i));
    }
    
    // 确认插入成功
    expect(storage.size()).toBe(ITEM_COUNT);
    
    // 测试随机访问
    const paths = storage.keys();
    for (let i = 0; i < 100; i++) {
      const randomIndex = Math.floor(Math.random() * paths.length);
      const path = paths[randomIndex];
      const item = storage.get(path);
      metadataManager.incrementAccessCount(path);
      metadataManager.updateAccessTime(path);
    }
    
    const end = performance.now();
    const duration = end - start;
    
    process.stdout.write(`\n存储性能测试: ${duration.toFixed(2)}ms\n`);
    
    // 性能应该在合理范围内
    expect(duration).toBeLessThan(1000);
  });
  
  test('缓存淘汰性能测试', () => {
    const start = performance.now();
    
    // 准备数据
    for (let i = 0; i < ITEM_COUNT; i++) {
      const path = `test/path${i}.md`;
      storage.set(path, createCacheItem(i));
    }
    
    // 执行淘汰
    strategy.evict(storage, 100);
    
    // 验证淘汰后的缓存大小
    expect(storage.size()).toBe(ITEM_COUNT - 100);
    
    const end = performance.now();
    const duration = end - start;
    
    process.stdout.write(`\n缓存淘汰性能测试: ${duration.toFixed(2)}ms\n`);
    
    // 性能应该在合理范围内
    expect(duration).toBeLessThan(1000);
  });
  
  test('元素关联性能测试', () => {
    const start = performance.now();
    
    // 创建DOM元素
    const elements: HTMLElement[] = [];
    const paths: string[] = [];
    
    for (let i = 0; i < 100; i++) { // 减少元素数量避免DOM操作过慢
      const element = document.createElement('div');
      document.body.appendChild(element);
      elements.push(element);
      
      const path = `test/file${i}.md`;
      paths.push(path);
      
      storage.set(path, createCacheItem(i));
    }
    
    // 关联元素
    for (let i = 0; i < 100; i++) {
      associator.associate(elements[i], paths[i], `file${i}.md`);
    }
    
    // 查询关联
    for (let i = 0; i < 100; i++) {
      associator.getAssociation(elements[i]);
    }
    
    const end = performance.now();
    const duration = end - start;
    
    process.stdout.write(`\n元素关联性能测试: ${duration.toFixed(2)}ms\n`);
    
    // 性能应该在合理范围内
    expect(duration).toBeLessThan(1000);
    
    // 清理
    document.body.innerHTML = '';
  });
  
  test('过期检查性能测试', () => {
    const start = performance.now();
    
    // 准备数据，一半是过期的
    const currentTime = Date.now();
    for (let i = 0; i < 500; i++) {
      const item = createCacheItem(i);
      item.timestamp = currentTime - (i % 2 === 0 ? 10 * 60 * 1000 : 1 * 60 * 1000);
      storage.set(`test/path${i}.md`, item);
    }
    
    // 检查过期状态
    const paths = storage.keys();
    for (const path of paths) {
      metadataManager.isExpired(path);
    }
    
    const end = performance.now();
    const duration = end - start;
    
    process.stdout.write(`\n过期检查性能测试: ${duration.toFixed(2)}ms\n`);
    
    // 性能应该在合理范围内
    expect(duration).toBeLessThan(1000);
  });
  
  afterAll(() => {
    process.stdout.write('\n性能测试完成！\n');
  });
}); 