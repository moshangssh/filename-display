import { WeakMapElementAssociator } from '../../../../src/services/cache/associator/WeakMapElementAssociator';

describe('WeakMapElementAssociator', () => {
  let associator: WeakMapElementAssociator;
  
  beforeEach(() => {
    associator = new WeakMapElementAssociator();
    // 重置DOM模拟
    document.body.innerHTML = '';
  });
  
  test('should associate elements with file paths', () => {
    // 创建测试DOM元素
    const element = document.createElement('div');
    document.body.appendChild(element);
    
    // 关联元素与路径
    associator.associate(element, 'test/path.md', 'original.md');
    
    // 验证关联成功
    const association = associator.getAssociation(element);
    expect(association).toBeDefined();
    expect(association?.path).toBe('test/path.md');
    expect(association?.originalName).toBe('original.md');
  });
  
  test('should return undefined for non-associated elements', () => {
    // 创建测试DOM元素
    const element = document.createElement('div');
    document.body.appendChild(element);
    
    // 未关联的元素
    const nonAssociatedElement = document.createElement('span');
    document.body.appendChild(nonAssociatedElement);
    
    // 只关联第一个元素
    associator.associate(element, 'test/path.md', 'original.md');
    
    // 验证未关联的元素返回undefined
    const association = associator.getAssociation(nonAssociatedElement);
    expect(association).toBeUndefined();
  });
  
  test('should update association for already associated elements', () => {
    // 创建测试DOM元素
    const element = document.createElement('div');
    document.body.appendChild(element);
    
    // 初始关联
    associator.associate(element, 'initial/path.md', 'initial.md');
    
    // 更新关联
    associator.associate(element, 'updated/path.md', 'updated.md');
    
    // 验证关联已更新
    const association = associator.getAssociation(element);
    expect(association).toBeDefined();
    expect(association?.path).toBe('updated/path.md');
    expect(association?.originalName).toBe('updated.md');
  });
  
  test('should maintain separate associations for different elements', () => {
    // 创建多个测试DOM元素
    const element1 = document.createElement('div');
    const element2 = document.createElement('span');
    document.body.appendChild(element1);
    document.body.appendChild(element2);
    
    // 关联不同元素到不同路径
    associator.associate(element1, 'path1.md', 'original1.md');
    associator.associate(element2, 'path2.md', 'original2.md');
    
    // 验证关联是独立的
    const association1 = associator.getAssociation(element1);
    const association2 = associator.getAssociation(element2);
    
    expect(association1?.path).toBe('path1.md');
    expect(association1?.originalName).toBe('original1.md');
    
    expect(association2?.path).toBe('path2.md');
    expect(association2?.originalName).toBe('original2.md');
  });
  
  // WeakMap的内存管理特性难以直接测试，因为垃圾回收不可控
  // 但至少可以验证基本功能正常
}); 