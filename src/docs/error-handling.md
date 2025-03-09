# 统一错误处理机制

本文档介绍了插件中的统一错误处理机制，包括如何使用错误处理工具、错误日志记录以及最佳实践。

## 错误处理基础概念

插件使用 `ErrorHandler` 类提供统一的错误处理机制，通过它可以：

1. 捕获和记录错误（包含上下文信息）
2. 对错误进行分级处理
3. 为重要错误显示用户通知
4. 包装函数添加错误处理能力
5. 实现函数重试逻辑
6. 记录函数执行时间

## 错误级别

错误处理机制支持以下错误级别：

- `INFO`: 信息级别，通常用于调试目的
- `WARNING`: 警告级别，表示可能的问题但不影响主要功能
- `ERROR`: 错误级别，表示功能运行失败
- `CRITICAL`: 严重错误，可能导致整个插件不可用

## 使用方法

### 方式1：直接捕获错误

```typescript
import { errorHandler, ErrorLevel } from 'src/utils';

try {
    // 可能抛出错误的代码
} catch (error) {
    errorHandler.captureError(error, {
        source: '当前类名',
        operation: '当前操作描述'
    }, ErrorLevel.ERROR);
}
```

### 方式2：包装函数

```typescript
import { errorHandler } from 'src/utils';

// 包装同步函数
const safeFunction = errorHandler.wrapWithErrorHandler(
    originalFunction,
    { source: '当前类名' },
    '操作描述'
);

// 包装异步函数
const safeAsyncFunction = errorHandler.wrapWithAsyncErrorHandler(
    originalAsyncFunction,
    { source: '当前类名' },
    '操作描述'
);
```

### 方式3：使用tryOrDefault模式

```typescript
// 同步函数
const result = errorHandler.tryOrDefault(
    () => {
        // 可能抛出错误的代码
        return computedValue;
    },
    defaultValue, // 出错时返回的默认值
    {
        source: '当前类名',
        operation: '操作描述'
    }
);

// 异步函数
const asyncResult = await errorHandler.tryOrDefaultAsync(
    async () => {
        // 可能抛出错误的异步代码
        return await computedValue;
    },
    defaultValue, // 出错时返回的默认值
    {
        source: '当前类名',
        operation: '操作描述'
    }
);
```

### 方式4：类方法包装

对于类方法，可以在构造函数中进行包装：

```typescript
class MyService {
    constructor() {
        // 包装类方法
        this.processFile = errorHandler.wrapWithErrorHandler(
            this.processFile.bind(this),
            { source: 'MyService' },
            'processFile'
        );
    }
    
    public processFile(file) {
        // 可能抛出错误的代码
    }
}
```

## 错误日志查看

错误处理器会自动记录所有捕获的错误。您可以通过以下方式访问错误日志：

```typescript
// 获取所有错误日志
const logs = errorHandler.getErrorLogs();

// 清除错误日志
errorHandler.clearErrorLogs();
```

## 最佳实践

1. **一致的错误上下文**：为每个服务类创建统一的错误上下文前缀
   ```typescript
   const ERROR_CONTEXT = { source: 'MyServiceName' };
   ```

2. **保持合适的错误级别**：根据错误的严重程度选择合适的错误级别

3. **为关键操作添加错误处理**：确保所有可能失败的关键操作都有适当的错误处理

4. **提供有用的错误消息**：错误消息应该清晰描述问题，并指出可能的解决方案

5. **避免吞噬错误**：除非您确定捕获错误后不需要进一步处理，否则应该提供合理的恢复策略

## 开发指南

要在项目中添加新的错误处理功能，请遵循以下步骤：

1. 导入错误处理工具：
   ```typescript
   import { errorHandler, ErrorLevel } from 'src/utils';
   ```

2. 对重要的方法添加错误处理包装

3. 确保异步方法中的错误也能被正确捕获和处理

4. 对性能敏感的方法添加执行时间记录，设置合理的阈值 