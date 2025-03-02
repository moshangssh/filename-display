# 实用工具函数

## 防抖函数 (Debounce)

本项目提供了基于RxJS的防抖函数实现，推荐使用统一接口。

### 1. 统一接口 (推荐用法)

```typescript
import { 
  debounceFn, 
  createDebouncedObservable
} from './utils/debounceIntegration';

// 创建防抖函数 
const debouncedHandler = debounceFn(
  (value: string) => console.log(value),
  300,           // 等待时间(毫秒)
  true,          // 是否立即执行第一次调用
  'searchInput'  // 可选的函数名(用于性能监控)
);

// 使用防抖函数
const result = debouncedHandler('搜索关键词');

// 取消待执行的调用
debouncedHandler.cancel();
```

### 2. 兼容旧接口

```typescript
import { createUnifiedDebouncedFunction } from './utils/debounceIntegration';

// 创建一个带性能监控的防抖函数
const debouncedHandler = createUnifiedDebouncedFunction(
  (value: string) => {
    console.log('处理输入:', value);
    return value.length;  // 可以有返回值
  },
  'searchInput', // 函数名(用于日志和性能监控)
  300,           // 等待时间(毫秒)
  true           // 是否立即执行第一次调用
);

// 使用和上面相同
const result = debouncedHandler('搜索关键词');
debouncedHandler.cancel();
```

### 3. Observable形式的防抖 (RxJS强大功能)

```typescript
import { createDebouncedObservable } from './utils/debounceIntegration';

// 创建防抖Observable
const { observable, next, cancel, complete } = createDebouncedObservable<string>(
  300,           // 等待时间(毫秒)
  true,          // 是否立即发出第一个值
  'searchInput'  // 可选的函数名(用于性能监控)
);

// 订阅结果
observable.subscribe(value => {
  console.log('处理输入:', value);
});

// 发送值
next('搜索关键词');

// 取消
cancel();

// 完成
complete();
```

## RxJS实现优势

RxJS防抖实现提供以下优势：

- **立即执行模式** - 支持首次调用立即执行
- **取消能力** - 随时取消待执行的操作
- **类型完善** - 完整的TypeScript类型支持
- **性能监控** - 内置与Obsidian兼容的性能监控
- **可链式调用** - 与其他RxJS操作符无缝集成
- **Observable兼容** - 完全融入响应式编程范式
- **Tree Shaking** - 优化打包体积 

## 代码库结构

- **debounceIntegration.ts**: 统一接口和配置
- **debounceRxJS.ts**: 基于RxJS的实现
- **performanceMonitor.ts**: 性能监控工具

## 性能监控使用

所有防抖实现都会自动使用性能监控机制，你可以在浏览器开发工具的性能面板中查看这些标记。 