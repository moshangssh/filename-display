# TitleExtractor 精简实施指南

## 精简实施步骤详解

本文档提供了 TitleExtractor 插件精简的具体实施指南，帮助开发者逐步完成精简工作。

## 前期准备

1. **创建项目备份**
   - 将整个项目复制到新目录
   - 或创建新的 Git 分支

2. **分析依赖关系**
   - 使用工具如 `madge` 分析代码依赖
   - 识别核心组件之间的依赖链

## 第一阶段：核心结构搭建

### 1. 创建简化的插件主类

```typescript
// src/plugin.ts
import { Plugin } from 'obsidian';
import { TitleExtractorSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { TitleExtractorSettingTab } from './settings/SettingsTab';
import { FilenameParser } from './core/Parser';
import { FileDisplayCache } from './core/Cache';
import { FileExplorerService } from './display/FileExplorer';
import { LinkDisplayService } from './display/LinkDisplay';

export default class TitleExtractorPlugin extends Plugin {
    settings: TitleExtractorSettings;
    filenameParser: FilenameParser;
    fileDisplayCache: FileDisplayCache;
    fileExplorerService: FileExplorerService;
    linkDisplayService: LinkDisplayService;
    
    async onload() {
        await this.loadSettings();
        
        // 初始化核心服务
        this.filenameParser = new FilenameParser(this);
        this.fileDisplayCache = new FileDisplayCache(this);
        this.fileExplorerService = new FileExplorerService(this, this.filenameParser, this.fileDisplayCache);
        this.linkDisplayService = new LinkDisplayService(this, this.filenameParser, this.fileDisplayCache);
        
        // 注册设置选项卡
        this.addSettingTab(new TitleExtractorSettingTab(this.app, this));
        
        // 注册核心事件
        this.registerFileEvents();
        
        // 初始化文件浏览器显示
        this.fileExplorerService.initialize();
        
        // 初始化链接显示
        if (this.settings.enableEditorLinkDecorations) {
            this.linkDisplayService.initialize();
        }
    }
    
    onunload() {
        // 清理资源
        this.fileExplorerService.cleanup();
        this.linkDisplayService.cleanup();
    }
    
    // 其他必要方法...
}
```

### 2. 精简设置类型定义

```typescript
// src/types.ts
export interface TitleExtractorSettings {
    pattern: string;
    useYamlTitleWhenAvailable: boolean;
    preferFrontmatterTitle: boolean;
    enabledFolders: string[];
    enableEditorLinkDecorations: boolean;
    cacheSize: number;
    debugMode: boolean;
}

export interface FileDisplayResult {
    success: boolean;
    displayName: string;
    error?: string;
    fromCache?: boolean;
}
```

### 3. 创建简化的核心解析器

```typescript
// src/core/Parser.ts
import { TFile } from 'obsidian';
import TitleExtractorPlugin from '../plugin';
import { FileDisplayResult } from '../types';

export class FilenameParser {
    private plugin: TitleExtractorPlugin;
    
    constructor(plugin: TitleExtractorPlugin) {
        this.plugin = plugin;
    }
    
    parseFilename(file: TFile): FileDisplayResult {
        try {
            const settings = this.plugin.settings;
            const fileName = file.basename;
            
            // 正则表达式提取
            if (settings.pattern) {
                const regex = new RegExp(settings.pattern);
                const match = fileName.match(regex);
                
                if (match && match[0]) {
                    return {
                        success: true,
                        displayName: match[0],
                    };
                }
            }
            
            // 未找到匹配，返回原始文件名
            return {
                success: true,
                displayName: fileName,
            };
        } catch (error) {
            return {
                success: false,
                displayName: file.basename,
                error: error.message
            };
        }
    }
    
    // 其他必要的解析方法...
}
```

## 第二阶段：实现核心功能

### 1. 创建简单的缓存系统

```typescript
// src/core/Cache.ts
import { TFile } from 'obsidian';
import TitleExtractorPlugin from '../plugin';
import { FileDisplayResult } from '../types';

export class FileDisplayCache {
    private plugin: TitleExtractorPlugin;
    private cache: Map<string, FileDisplayResult>;
    
    constructor(plugin: TitleExtractorPlugin) {
        this.plugin = plugin;
        this.cache = new Map();
    }
    
    get(file: TFile): FileDisplayResult | undefined {
        return this.cache.get(file.path);
    }
    
    set(file: TFile, result: FileDisplayResult): void {
        // 简单的LRU实现，限制缓存大小
        if (this.cache.size >= this.plugin.settings.cacheSize) {
            // 删除最早添加的项
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(file.path, result);
    }
    
    invalidate(file: TFile): void {
        this.cache.delete(file.path);
    }
    
    clear(): void {
        this.cache.clear();
    }
}
```

### 2. 实现文件资源管理器服务

```typescript
// src/display/FileExplorer.ts
import { TFile, TAbstractFile } from 'obsidian';
import TitleExtractorPlugin from '../plugin';
import { FilenameParser } from '../core/Parser';
import { FileDisplayCache } from '../core/Cache';

export class FileExplorerService {
    private plugin: TitleExtractorPlugin;
    private parser: FilenameParser;
    private cache: FileDisplayCache;
    
    constructor(
        plugin: TitleExtractorPlugin,
        parser: FilenameParser,
        cache: FileDisplayCache
    ) {
        this.plugin = plugin;
        this.parser = parser;
        this.cache = cache;
    }
    
    initialize(): void {
        // 注册文件资源管理器事件
        this.registerFileExplorerEvents();
    }
    
    cleanup(): void {
        // 清理事件监听
    }
    
    updateFileDisplay(file: TFile): void {
        if (!(file instanceof TFile) || !file.extension.match(/(md|markdown)$/)) {
            return;
        }
        
        // 检查是否在启用的文件夹中
        if (this.plugin.settings.enabledFolders.length > 0 && 
            !this.plugin.settings.enabledFolders.some(folder => file.path.startsWith(folder))) {
            return;
        }
        
        // 从缓存获取或解析文件名
        let displayResult = this.cache.get(file);
        
        if (!displayResult) {
            displayResult = this.parser.parseFilename(file);
            this.cache.set(file, displayResult);
        }
        
        if (displayResult.success) {
            this.updateDOMForFile(file, displayResult.displayName);
        }
    }
    
    private updateDOMForFile(file: TFile, displayName: string): void {
        // 查找并更新DOM中的文件名显示
        const fileExplorer = this.getFileExplorer();
        if (!fileExplorer) return;
        
        const fileItems = fileExplorer.querySelectorAll('.nav-file-title');
        
        for (const item of Array.from(fileItems)) {
            const titleEl = item as HTMLElement;
            const filePath = titleEl.getAttribute('data-path');
            
            if (filePath === file.path) {
                const innerTitle = titleEl.querySelector('.nav-file-title-content');
                if (innerTitle) {
                    innerTitle.textContent = displayName;
                }
                break;
            }
        }
    }
    
    private getFileExplorer(): HTMLElement | null {
        return document.querySelector('.nav-files-container');
    }
    
    private registerFileExplorerEvents(): void {
        // 注册必要的事件监听
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile) {
                    this.updateFileDisplay(file);
                }
            })
        );
        
        // 文件添加事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('create', (file) => {
                if (file instanceof TFile) {
                    this.updateFileDisplay(file);
                }
            })
        );
        
        // 文件修改事件
        this.plugin.registerEvent(
            this.plugin.app.vault.on('rename', (file) => {
                if (file instanceof TFile) {
                    this.cache.invalidate(file);
                    this.updateFileDisplay(file);
                }
            })
        );
    }
}
```

### 3. 实现链接显示服务

```typescript
// src/display/LinkDisplay.ts
import { TFile, EditorView } from 'obsidian';
import TitleExtractorPlugin from '../plugin';
import { FilenameParser } from '../core/Parser';
import { FileDisplayCache } from '../core/Cache';

export class LinkDisplayService {
    private plugin: TitleExtractorPlugin;
    private parser: FilenameParser;
    private cache: FileDisplayCache;
    
    constructor(
        plugin: TitleExtractorPlugin,
        parser: FilenameParser,
        cache: FileDisplayCache
    ) {
        this.plugin = plugin;
        this.parser = parser;
        this.cache = cache;
    }
    
    initialize(): void {
        // 注册编辑器扩展
        this.registerEditorExtension();
    }
    
    cleanup(): void {
        // 清理资源
    }
    
    private registerEditorExtension(): void {
        // 简化的编辑器扩展，用于替换链接显示文本
    }
}
```

## 第三阶段：精简设置界面

```typescript
// src/settings/SettingsTab.ts
import { App, PluginSettingTab, Setting } from 'obsidian';
import TitleExtractorPlugin from '../plugin';

export class TitleExtractorSettingTab extends PluginSettingTab {
    plugin: TitleExtractorPlugin;
    
    constructor(app: App, plugin: TitleExtractorPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    
    display(): void {
        const {containerEl} = this;
        containerEl.empty();
        
        containerEl.createEl('h2', {text: 'TitleExtractor 设置'});
        
        new Setting(containerEl)
            .setName('正则表达式模式')
            .setDesc('用于从文件名中提取显示名称的正则表达式')
            .addText(text => text
                .setPlaceholder('例如: (?<=\\d{4}_\\d{2}_\\d{2}_).*$')
                .setValue(this.plugin.settings.pattern)
                .onChange(async (value) => {
                    this.plugin.settings.pattern = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('使用YAML标题')
            .setDesc('当可用时，使用YAML前置元数据中的标题')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useYamlTitleWhenAvailable)
                .onChange(async (value) => {
                    this.plugin.settings.useYamlTitleWhenAvailable = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('优先前置元数据标题')
            .setDesc('优先使用前置元数据中的标题，而不是文件名')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.preferFrontmatterTitle)
                .onChange(async (value) => {
                    this.plugin.settings.preferFrontmatterTitle = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('启用编辑器链接装饰')
            .setDesc('在编辑器中替换链接显示文本')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableEditorLinkDecorations)
                .onChange(async (value) => {
                    this.plugin.settings.enableEditorLinkDecorations = value;
                    await this.plugin.saveSettings();
                    
                    // 根据设置启用或禁用链接装饰
                    if (value) {
                        this.plugin.linkDisplayService.initialize();
                    } else {
                        this.plugin.linkDisplayService.cleanup();
                    }
                }));
        
        new Setting(containerEl)
            .setName('缓存大小')
            .setDesc('最大缓存项目数量')
            .addSlider(slider => slider
                .setLimits(100, 5000, 100)
                .setValue(this.plugin.settings.cacheSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.cacheSize = value;
                    await this.plugin.saveSettings();
                }));
    }
}
```

## 测试与调试

1. **单元测试重点**
   - 文件名解析功能
   - 缓存管理
   - 配置加载/保存

2. **手动测试清单**
   - 验证文件浏览器中的文件名显示
   - 测试链接显示
   - 验证各种设置组合

3. **调试技巧**
   - 在插件主类中添加简单的日志功能
   - 使用 `debugMode` 设置来控制详细日志输出

## 后续维护

1. **性能优化**
   - 监控内存使用
   - 识别并优化瓶颈

2. **功能扩展**
   - 如何在简化架构上添加新功能
   - 保持精简原则

## 常见问题

1. **Q: 精简后某些功能不再工作怎么办？**
   - A: 仔细检查相关服务的依赖关系，确保核心功能链路完整。

2. **Q: 如何处理老数据的迁移？**
   - A: 添加简单的迁移功能，在插件首次加载时执行。

3. **Q: 如何保持性能不受影响？**
   - A: 重点关注文件名解析和缓存机制，确保对大量文件时的响应速度。

---

通过按照本指南的步骤实施，您可以将 TitleExtractor 插件从复杂的架构精简为专注于核心功能的简化版本，同时保持插件的主要功能和用户体验。🔧🚀 