import { FileCacheStorage } from '../../../../src/services/cache/storage/FileCacheStorage';
import { FileCacheItem } from '../../../../src/services/cache/interfaces/FileCacheTypes';

describe('FileCacheStorage', () => {
  let storage: FileCacheStorage;
  let mockCacheItem: FileCacheItem;

  beforeEach(() => {
    storage = new FileCacheStorage();
    mockCacheItem = {
      displayName: '测试显示名称',
      originalName: '测试原始名称.md',
      timestamp: Date.now(),
      mtime: Date.now(),
      processed: true,
      links: new Set<string>(['link1', 'link2']),
      priority: false,
      accessCount: 0,
      result: undefined
    };
  });

  test('should store and retrieve cache items', () => {
    storage.set('test/path.md', mockCacheItem);
    expect(storage.get('test/path.md')).toBe(mockCacheItem);
  });

  test('should check if cache item exists', () => {
    storage.set('test/path.md', mockCacheItem);
    expect(storage.has('test/path.md')).toBe(true);
    expect(storage.has('nonexistent/path.md')).toBe(false);
  });

  test('should delete cache items', () => {
    storage.set('test/path.md', mockCacheItem);
    expect(storage.has('test/path.md')).toBe(true);
    
    storage.delete('test/path.md');
    expect(storage.has('test/path.md')).toBe(false);
  });

  test('should clear all cache items', () => {
    storage.set('test/path1.md', mockCacheItem);
    storage.set('test/path2.md', {...mockCacheItem, displayName: '另一个测试'});
    expect(storage.size()).toBe(2);
    
    storage.clear();
    expect(storage.size()).toBe(0);
  });

  test('should return correct cache size', () => {
    expect(storage.size()).toBe(0);
    
    storage.set('test/path1.md', mockCacheItem);
    expect(storage.size()).toBe(1);
    
    storage.set('test/path2.md', {...mockCacheItem, displayName: '另一个测试'});
    expect(storage.size()).toBe(2);
  });

  test('should return all cache keys', () => {
    storage.set('test/path1.md', mockCacheItem);
    storage.set('test/path2.md', {...mockCacheItem, displayName: '另一个测试'});
    
    const keys = storage.keys();
    expect(keys).toHaveLength(2);
    expect(keys).toContain('test/path1.md');
    expect(keys).toContain('test/path2.md');
  });

  test('should return all cache values', () => {
    const mockItem2 = {...mockCacheItem, displayName: '另一个测试'};
    
    storage.set('test/path1.md', mockCacheItem);
    storage.set('test/path2.md', mockItem2);
    
    const values = storage.values();
    expect(values).toHaveLength(2);
    expect(values).toContainEqual(mockCacheItem);
    expect(values).toContainEqual(mockItem2);
  });

  test('should return all cache entries', () => {
    const mockItem2 = {...mockCacheItem, displayName: '另一个测试'};
    
    storage.set('test/path1.md', mockCacheItem);
    storage.set('test/path2.md', mockItem2);
    
    const entries = storage.entries();
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual(['test/path1.md', mockCacheItem]);
    expect(entries).toContainEqual(['test/path2.md', mockItem2]);
  });
}); 