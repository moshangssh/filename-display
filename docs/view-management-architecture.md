# 视图管理架构设计

## 架构概述

本项目采用统一的视图管理架构，每个主要视图（Explorer View、Reading View、Editing View）由专门的独立模块负责管理，形成清晰的职责分离和一致的接口设计。

## 核心视图管理模块

### 1. ExplorerViewManager（新增）

负责文件浏览器视图的管理，整合了之前分散在`FileExplorerDisplayService`和`FileNameDisplayManager`中的功能。

**主要职责**：
- 监听文件浏览器DOM变化
- 处理文件项显示
- 管理文件名称展示
- 优化大型文件列表性能

**关键接口**：
```typescript
interface IExplorerViewManager {
    setupView(): void;
    updateView(): void;
    processExplorerItems(): void;
    updateFileItem(file: TFile): void;
    dispose(): void;
}
```

### 2. ReadingViewManager (对应当前的 MarkdownLinkService)

负责阅读视图中的内容管理，特别是链接处理。

**主要职责**：
- 处理Markdown阅读视图中的链接
- 更新链接显示
- 维护链接状态

**关键接口**：
```typescript
interface IReadingViewManager {
    setupView(): void;
    updateView(): void;
    processLinks(): void;
    updateLinksForFile(file: TFile): void;
    dispose(): void;
}
```

### 3. EditingViewManager (对应当前的 EditorLinkDecorator)

负责编辑视图中的内容管理和装饰。

**主要职责**：
- 在编辑器中装饰链接
- 处理CodeMirror编辑器扩展
- 监听编辑器变更
- 批量处理链接更新

**关键接口**：
```typescript
interface IEditingViewManager {
    setupView(): void;
    updateView(): void;
    processLinks(): void;
    getExtensions(): Extension[];
    dispose(): void;
}
```

## 架构设计原则

为确保三个视图管理器的一致性和高质量，我们遵循以下设计原则：

### 1. 接口统一

所有视图管理器实现通用的基本接口：

```typescript
interface IViewManager {
    setupView(): void;       // 初始化视图
    updateView(): void;      // 更新视图
    dispose(): void;         // 清理资源
}
```

### 2. 依赖注入

所有视图管理器通过服务容器获取依赖，统一使用静态工厂方法：

```typescript
public static create(plugin: ITitleExtractorPlugin): ViewManager {
    const container = ServiceContainer.getInstance();
    // 获取依赖...
    return new ViewManager(plugin, ...dependencies);
}
```

### 3. 生命周期管理

统一的生命周期管理，包括：
- 初始化阶段：在插件加载时设置
- 运行阶段：响应事件并更新视图
- 卸载阶段：释放资源

### 4. 性能优化策略

所有视图管理器统一使用以下优化策略：
- 批处理机制
- 缓存优化
- 增量更新
- 懒加载
- 防抖/节流

## 服务交互

视图管理器与其他服务的交互关系：

```
+-------------------+      +-------------------+     +-------------------+
|                   |      |                   |     |                   |
| ExplorerViewMgr   |      | ReadingViewMgr    |     | EditingViewMgr    |
|                   |      |                   |     |                   |
+--------+----------+      +--------+----------+     +--------+----------+
         |                          |                          |
         |                          |                          |
         v                          v                          v
+-------------------+      +-------------------+     +-------------------+
|                   |      |                   |     |                   |
| FileDisplayCache  +----->+ FilenameParser    +<----+ LinkStateManager  |
|                   |      |                   |     |                   |
+--------+----------+      +-------------------+     +-------------------+
         |
         |
         v
+-------------------+
|                   |
| EventManager      |
|                   |
+-------------------+
```

## 视图处理流程

统一的处理流程模式：

1. **监听事件**：各视图管理器监听相关事件（文件变更、编辑器状态更新等）
2. **收集更新**：批量收集需要更新的项目
3. **处理更新**：批处理更新，避免频繁触发
4. **应用更新**：将更新应用到视图
5. **缓存结果**：缓存处理结果以优化后续操作

## 迁移计划

为确保平滑过渡到新架构，我们将：
1. 创建新的视图管理器基类，定义统一接口
2. 实现ExplorerViewManager
3. 将MarkdownLinkService重构为ReadingViewManager
4. 将EditorLinkDecorator重构为EditingViewManager
5. 更新插件主类中的引用和注册
6. 并行运行旧实现和新实现一段时间，确保功能稳定
7. 完全迁移到新架构

## 未来拓展

该架构设计为以下功能提供了基础：
1. **插件化视图管理**：允许第三方插件扩展各视图
2. **自定义视图主题**：更容易实现主题定制
3. **多视图协调**：视图间数据和状态协调
4. **高级缓存策略**：实现更智能的视图缓存
5. **性能分析**：更精确地分析各视图性能瓶颈 