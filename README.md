# 统一DOM观察系统

## 设计概述

本项目实现了一个统一的DOM观察系统，整合了原有的三个相似但功能重复的服务：

1. **DOMObserverService** - 负责监听文件树等UI元素的DOM变化
2. **VisibilityTracker** - 专注于监控元素可见性
3. **EditorViewport** - 负责监听视口变化和优化DOM操作

## 架构设计

### 核心组件

- **UnifiedDOMObserver** - 统一的观察系统，提供所有核心功能
- **适配器类** - 保持向后兼容，使现有代码能够无缝使用新系统

### 关键特性

1. **统一元素追踪**: 使用单一数据结构和算法追踪DOM元素
2. **统一事件分发**: 集中处理所有DOM事件并分发给相应的监听器
3. **性能优化**: 避免多个观察器重复处理相同的元素和事件
4. **向后兼容**: 原有API继续可用，无需修改现有代码

## 实现细节

### UnifiedDOMObserver

主观察器，使用两种观察器：

1. **IntersectionObserver** - 高效监控元素可见性
2. **MutationObserver** - 监控DOM结构变化

### 适配器

三个适配器类继承了原有的接口：

- **DOMObserverService (Adapter)** - 转发DOM变化事件
- **VisibilityTracker (Adapter)** - 专注于内部链接元素的可见性
- **EditorViewport (Adapter)** - 处理所有元素的可见性

### 全局访问

使用`window.activeUnifiedObserver`使适配器能够访问统一实例，这是一种轻量的依赖注入方式。

## 优势

1. **代码复用**: 消除了三个服务之间的代码重复
2. **性能提升**: 减少了多个观察器造成的性能开销
3. **更好的维护性**: 集中的观察逻辑更易于维护和扩展
4. **保持兼容**: 对现有代码无影响

## 使用方法

### 现有代码

现有代码继续使用原有的服务类，无需修改：

```typescript
// 仍然可以正常使用
const domObserver = new DOMObserverService(callback);
const tracker = new VisibilityTracker(app);
const viewport = new EditorViewport(app);
```

### 直接使用统一系统

如需更多功能，可直接使用统一观察器：

```typescript
// 获取统一观察器实例
const observer = window.activeUnifiedObserver;

// 添加可见性变更监听器
observer.addVisibilityChangeListener((elements) => {
  console.log('可见元素变化:', elements);
});

// 添加DOM变更监听器
observer.addDOMChangeListener(() => {
  console.log('DOM结构已变化');
});
``` 