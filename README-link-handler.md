# 链接处理抽象设计

## 设计概述

该设计通过创建通用的链接处理基础类和相关接口，实现了对Obsidian中内部链接处理逻辑的抽象和统一。主要解决了以下问题：

1. 消除 `EditorLinkDecorator` 和 `MarkdownLinkService` 类之间的代码重复
2. 提供统一的链接处理接口和流程
3. 增强了代码的可扩展性和可维护性
4. 简化了未来添加新的链接处理功能的实现难度

## 核心组件

### 1. LinkInfo 接口

```typescript
export interface LinkInfo {
    text: string;          // 链接显示的文本
    path: string;          // 链接指向的路径
    file?: TFile;          // 链接指向的文件对象（如果存在）
    element?: HTMLElement; // 链接对应的DOM元素（只在阅读视图中使用）
    from?: number;         // 链接在编辑器中的起始位置（只在编辑器视图中使用）
    to?: number;           // 链接在编辑器中的结束位置（只在编辑器视图中使用）
}
```

### 2. LinkProcessResult 接口

```typescript
export interface LinkProcessResult {
    success: boolean;                 // 处理是否成功
    originalInfo: LinkInfo;           // 原始链接信息
    displayName?: string;             // 处理后的显示名称
    shouldUpdate: boolean;            // 是否需要更新链接显示
}
```

### 3. LinkHandlerConfig 接口

```typescript
export interface LinkHandlerConfig {
    enabled: boolean;                  // 是否启用链接处理
    respectCustomLinkText: boolean;    // 是否尊重自定义链接文本
    processingScope?: string;          // 处理范围 (editor, preview, both)
}
```

### 4. LinkHandler 抽象类

抽象基类定义了链接处理的基本流程和通用方法：

- `processFile(file: TFile)`: 处理文件获取显示名称
- `getFileFromLink(linkPath: string)`: 从链接路径获取文件对象
- `processLinkInfo(linkInfo: LinkInfo)`: 处理单个链接信息
- `processLinks()`: 处理所有链接的公共方法

子类需要实现的抽象方法：

- `collectLinks()`: 收集需要处理的链接
- `applyDisplayName(linkProcessResult: LinkProcessResult)`: 应用显示名称到链接

## 实现类

### 1. EditorLinkDecorator

负责处理编辑器模式下的链接装饰：

- 继承 `LinkHandler` 抽象类
- 实现编辑器特定的链接收集和装饰应用逻辑
- 使用 CodeMirror 的状态效果和装饰机制

### 2. MarkdownLinkService

负责处理预览模式下的链接显示：

- 继承 `LinkHandler` 抽象类
- 实现预览模式特定的链接收集和更新逻辑
- 处理所有打开的Markdown视图中的链接

## 使用方法

### 创建新的链接处理器

```typescript
class MyCustomLinkHandler extends LinkHandler {
    constructor(plugin: IFilenameDisplayPlugin, 
                filenameParser: FilenameParser, 
                fileDisplayCache: FileDisplayCache) {
        super(plugin, filenameParser, fileDisplayCache, {
            enabled: true,
            processingScope: 'custom',
            respectCustomLinkText: true
        });
    }
    
    // 实现收集链接的方法
    protected collectLinks(): LinkInfo[] {
        // 自定义链接收集逻辑
        return links;
    }
    
    // 实现应用显示名称的方法
    protected applyDisplayName(result: LinkProcessResult): void {
        // 自定义显示名称应用逻辑
    }
}
```

### 配置现有处理器

```typescript
const linkHandler = new EditorLinkDecorator(plugin, filenameParser, fileDisplayCache);

// 更新配置
linkHandler.setConfig({
    enabled: true,
    respectCustomLinkText: false
});

// 触发链接处理
linkHandler.processLinks();
```

## 扩展思路

1. 支持更多类型的链接（外部链接、图片链接等）
2. 添加链接处理过滤器和钩子函数
3. 实现链接预处理和后处理管道
4. 添加特定链接类型的自定义处理器 