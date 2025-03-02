# 实用工具函数

## 防抖函数 (Debounce)

本项目提供了几种防抖函数实现，推荐使用统一接口。

### 1. 统一接口 (推荐用法)

```typescript
import { 
  debounceFn, 
  setDebounceImplementation, 
  DebounceImplementation 
} from './utils/debounceIntegration';

// 可选：设置使用RxJS实现
setDebounceImplementation(DebounceImplementation.RXJS);

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

### 3. Observable形式的防抖 (RxJS特有)

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

### 4. 原始实现 (内部使用)

以下是内部使用的实现，推荐通过统一接口访问：

```typescript
// 自定义实现
import { debounce } from './utils/debounce';

// RxJS实现
import { debounceRxJS } from './utils/debounceRxJS';
```

## 实现比较

| 特性 | 自定义实现 | RxJS实现 |
|------|-----------|---------|
| 立即执行模式 | ✅ | ✅ |
| 取消能力 | ✅ | ✅ |
| 类型完善 | ✅ | ✅ |
| 性能监控 | ✅ | ✅ |
| 可链式调用 | ❌ | ✅ |
| 兼容Observable | ❌ | ✅ |
| Tree Shaking | ✅ | ✅ |
| 额外依赖 | 无 | RxJS |
| 文件大小 | 小 | 中等 |

## 选择建议

- **简单场景**：保持默认设置（自定义实现）
- **响应式编程**：设置使用RxJS实现 `setDebounceImplementation(DebounceImplementation.RXJS)`
- **复杂流程**：使用Observable形式 `createDebouncedObservable`

## 代码库结构

- **debounceIntegration.ts**: 统一接口和配置
- **debounce.ts**: 原生JavaScript实现 
- **debounceRxJS.ts**: 基于RxJS的实现
- **performanceMonitor.ts**: 性能监控工具

## 安装RxJS

如要使用RxJS实现，请先安装依赖：

```bash
npm install rxjs --save
# 或
yarn add rxjs
```

## 性能监控使用

所有防抖实现都会自动使用性能监控机制，你可以在浏览器开发工具的性能面板中查看这些标记。 