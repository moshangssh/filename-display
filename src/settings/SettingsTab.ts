import { App, PluginSettingTab, Setting, Plugin, normalizePath, Notice } from 'obsidian';
import type { TitleExtractorSettings } from '../types';
import { CacheCleanStrategy } from '../services/interfaces/IServices';

interface ITitleExtractorPlugin extends Plugin {
    settings: TitleExtractorSettings;
    saveSettings(): Promise<void>;
    updateAllFilesDisplay(): void;
}

export class TitleExtractorSettingTab extends PluginSettingTab {
    plugin: ITitleExtractorPlugin;

    constructor(app: App, plugin: ITitleExtractorPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: '文件名显示设置'});

        new Setting(containerEl)
            .setName('正则表达式模式')
            .setDesc('用于从文件名中提取显示文本的正则表达式。默认模式：(?<=\\d{4}_\\d{2}_\\d{2}_).*$')
            .addText(text => text
                .setPlaceholder('输入正则表达式')
                .setValue(this.plugin.settings.pattern)
                .onChange(async (value) => {
                    this.plugin.settings.pattern = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateAllFilesDisplay();
                }));
        
        new Setting(containerEl)
            .setName('使用YAML前置元数据标题')
            .setDesc('当文件包含YAML前置元数据标题时，使用该标题代替文件名')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useYamlTitleWhenAvailable)
                .onChange(async (value) => {
                    this.plugin.settings.useYamlTitleWhenAvailable = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateAllFilesDisplay();
                }));
        
        new Setting(containerEl)
            .setName('优先使用元数据标题')
            .setDesc('当同时存在元数据标题和文件名匹配时，优先使用元数据标题')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.preferFrontmatterTitle)
                .onChange(async (value) => {
                    this.plugin.settings.preferFrontmatterTitle = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateAllFilesDisplay();
                }));
        
        new Setting(containerEl)
            .setName('启用编辑器链接装饰')
            .setDesc('在编辑器中显示文档链接的处理后名称（而不是文件名）')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableEditorLinkDecorations)
                .onChange(async (value) => {
                    this.plugin.settings.enableEditorLinkDecorations = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateAllFilesDisplay();
                }));

        // 新增：回退到 DOM 操作的设置
        new Setting(containerEl)
            .setName('启用 DOM 回退')
            .setDesc('当 Obsidian API 无法操作文件资源管理器时，回退到 DOM 操作')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.fallbackToDOMForFileExplorer)
                .onChange(async (value) => {
                    this.plugin.settings.fallbackToDOMForFileExplorer = value;
                    await this.plugin.saveSettings();
                }));

        // 新增：额外正则表达式配置
        containerEl.createEl('h3', {text: '额外正则表达式配置'});
        
        new Setting(containerEl)
            .setName('启用额外正则表达式')
            .setDesc('使用额外的正则表达式来匹配文件名')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.additionalPatterns.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.additionalPatterns.enabled = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateAllFilesDisplay();
                }));
        
        // 额外正则表达式匹配模式
        if (this.plugin.settings.additionalPatterns.enabled) {
            new Setting(containerEl)
                .setName('匹配模式')
                .setDesc('选择正则表达式的匹配模式')
                .addDropdown(dropdown => dropdown
                    .addOption('first', '使用第一个匹配')
                    .addOption('all', '使用所有匹配(拼接结果)')
                    .setValue(this.plugin.settings.additionalPatterns.matchMode)
                    .onChange(async (value: 'first' | 'all') => {
                        this.plugin.settings.additionalPatterns.matchMode = value;
                        await this.plugin.saveSettings();
                        this.plugin.updateAllFilesDisplay();
                    }));
                    
            // 额外正则表达式列表
            const patternsContainer = containerEl.createDiv('additional-patterns-container');
            
            // 显示当前已添加的正则表达式
            this.renderPatternsList(patternsContainer);
            
            // 添加新正则表达式的设置
            new Setting(containerEl)
                .setName('添加额外正则表达式')
                .setDesc('添加另一个用于匹配文件名的正则表达式')
                .addText(text => text
                    .setPlaceholder('输入正则表达式')
                    .then(textComponent => {
                        // 添加按钮
                        textComponent.inputEl.parentElement?.appendChild(
                            createEl('button', {
                                text: '添加',
                                cls: 'mod-cta',
                                attr: {
                                    style: 'margin-left: 8px;'
                                }
                            }, (button) => {
                                button.addEventListener('click', async () => {
                                    const value = textComponent.getValue().trim();
                                    
                                    if (value) {
                                        // 检查正则表达式是否已存在
                                        if (!this.plugin.settings.additionalPatterns.patterns.includes(value)) {
                                            // 添加新正则表达式
                                            this.plugin.settings.additionalPatterns.patterns.push(value);
                                            new Notice(`已添加正则表达式：${value}`);
                                            await this.plugin.saveSettings();
                                            this.plugin.updateAllFilesDisplay();
                                            
                                            // 清空输入框
                                            textComponent.setValue('');
                                            
                                            // 重新渲染正则表达式列表
                                            this.renderPatternsList(patternsContainer);
                                        } else {
                                            new Notice(`正则表达式已存在：${value}`);
                                        }
                                    }
                                });
                            })
                        );
                    }));
        }
                
        // 指定生效目录设置
        containerEl.createEl('h3', {text: '生效范围设置'});
        
        const folderListContainer = containerEl.createDiv('folder-list-container');
        
        // 显示当前已添加的文件夹
        this.renderFolderList(folderListContainer);
        
        // 添加新文件夹的设置
        new Setting(containerEl)
            .setName('添加生效目录')
            .setDesc('添加插件生效的目录路径（包括子文件夹）。留空则对所有文件夹生效。')
            .addText(text => text
                .setPlaceholder('输入目录路径，如：Daily Notes')
                .then(textComponent => {
                    // 添加按钮
                    textComponent.inputEl.parentElement?.appendChild(
                        createEl('button', {
                            text: '添加',
                            cls: 'mod-cta',
                            attr: {
                                style: 'margin-left: 8px;'
                            }
                        }, (button) => {
                            button.addEventListener('click', async () => {
                                const value = textComponent.getValue().trim();
                                
                                // 处理空值情况 - 空值表示对所有文件夹生效
                                if (value === '' && !this.plugin.settings.enabledFolders.includes('')) {
                                    // 清空之前所有的路径设置（因为空值覆盖所有）
                                    this.plugin.settings.enabledFolders = [''];
                                    new Notice('已设置为对所有文件夹生效');
                                    await this.plugin.saveSettings();
                                    this.plugin.updateAllFilesDisplay();
                                    
                                    // 重新渲染文件夹列表
                                    this.renderFolderList(folderListContainer);
                                    return;
                                }
                                
                                // 处理常规路径
                                if (value) {
                                    // 使用normalizePath处理路径
                                    const normalizedPath = normalizePath(value);
                                    
                                    // 检查路径是否已存在
                                    if (!this.plugin.settings.enabledFolders.includes(normalizedPath)) {
                                        // 如果有空字符串（全局生效），则先移除它
                                        const emptyIndex = this.plugin.settings.enabledFolders.indexOf('');
                                        if (emptyIndex !== -1) {
                                            this.plugin.settings.enabledFolders.splice(emptyIndex, 1);
                                        }
                                        
                                        // 添加新路径
                                        this.plugin.settings.enabledFolders.push(normalizedPath);
                                        new Notice(`已添加生效目录：${normalizedPath}`);
                                        await this.plugin.saveSettings();
                                        this.plugin.updateAllFilesDisplay();
                                        
                                        // 清空输入框
                                        textComponent.setValue('');
                                        
                                        // 重新渲染文件夹列表
                                        this.renderFolderList(folderListContainer);
                                    } else {
                                        new Notice(`目录已存在：${normalizedPath}`);
                                    }
                                }
                            });
                        })
                    );
                }));

        // 新增：文件处理优先级设置
        containerEl.createEl('h3', {text: '文件处理优先级设置'});
        
        // 高优先级文件夹设置
        const highPriorityContainer = containerEl.createDiv('high-priority-container');
        containerEl.createEl('h4', {text: '高优先级文件夹', attr: {style: 'margin-bottom: 5px;'}});
        
        // 显示当前已添加的高优先级文件夹
        this.renderPriorityFolderList(highPriorityContainer, 'high');
        
        // 添加高优先级文件夹
        new Setting(containerEl)
            .setName('添加高优先级文件夹')
            .setDesc('添加需要优先处理的文件夹。这些文件夹中的文件将优先被处理。')
            .addText(text => text
                .setPlaceholder('输入目录路径')
                .then(textComponent => {
                    // 添加按钮
                    textComponent.inputEl.parentElement?.appendChild(
                        createEl('button', {
                            text: '添加',
                            cls: 'mod-cta',
                            attr: {
                                style: 'margin-left: 8px;'
                            }
                        }, (button) => {
                            button.addEventListener('click', async () => {
                                const value = textComponent.getValue().trim();
                                
                                if (value) {
                                    const normalizedPath = normalizePath(value);
                                    
                                    // 检查路径是否已存在
                                    if (!this.plugin.settings.processingPriority.highPriorityFolders.includes(normalizedPath)) {
                                        // 检查是否已在低优先级列表中
                                        const lowIndex = this.plugin.settings.processingPriority.lowPriorityFolders.indexOf(normalizedPath);
                                        if (lowIndex !== -1) {
                                            // 从低优先级列表中移除
                                            this.plugin.settings.processingPriority.lowPriorityFolders.splice(lowIndex, 1);
                                            new Notice(`已从低优先级移动到高优先级：${normalizedPath}`);
                                        } else {
                                            new Notice(`已添加高优先级目录：${normalizedPath}`);
                                        }
                                        
                                        // 添加到高优先级列表
                                        this.plugin.settings.processingPriority.highPriorityFolders.push(normalizedPath);
                                        await this.plugin.saveSettings();
                                        this.plugin.updateAllFilesDisplay();
                                        
                                        // 清空输入框
                                        textComponent.setValue('');
                                        
                                        // 重新渲染高优先级和低优先级列表
                                        this.renderPriorityFolderList(highPriorityContainer, 'high');
                                        this.renderPriorityFolderList(lowPriorityContainer, 'low');
                                    } else {
                                        new Notice(`目录已在高优先级列表：${normalizedPath}`);
                                    }
                                }
                            });
                        })
                    );
                }));
        
        // 低优先级文件夹设置
        const lowPriorityContainer = containerEl.createDiv('low-priority-container');
        containerEl.createEl('h4', {text: '低优先级文件夹', attr: {style: 'margin-bottom: 5px;'}});
        
        // 显示当前已添加的低优先级文件夹
        this.renderPriorityFolderList(lowPriorityContainer, 'low');
        
        // 添加低优先级文件夹
        new Setting(containerEl)
            .setName('添加低优先级文件夹')
            .setDesc('添加延后处理的文件夹。这些文件夹中的文件将在其他文件处理完后再处理。')
            .addText(text => text
                .setPlaceholder('输入目录路径')
                .then(textComponent => {
                    // 添加按钮
                    textComponent.inputEl.parentElement?.appendChild(
                        createEl('button', {
                            text: '添加',
                            cls: 'mod-cta',
                            attr: {
                                style: 'margin-left: 8px;'
                            }
                        }, (button) => {
                            button.addEventListener('click', async () => {
                                const value = textComponent.getValue().trim();
                                
                                if (value) {
                                    const normalizedPath = normalizePath(value);
                                    
                                    // 检查路径是否已存在
                                    if (!this.plugin.settings.processingPriority.lowPriorityFolders.includes(normalizedPath)) {
                                        // 检查是否已在高优先级列表中
                                        const highIndex = this.plugin.settings.processingPriority.highPriorityFolders.indexOf(normalizedPath);
                                        if (highIndex !== -1) {
                                            // 从高优先级列表中移除
                                            this.plugin.settings.processingPriority.highPriorityFolders.splice(highIndex, 1);
                                            new Notice(`已从高优先级移动到低优先级：${normalizedPath}`);
                                        } else {
                                            new Notice(`已添加低优先级目录：${normalizedPath}`);
                                        }
                                        
                                        // 添加到低优先级列表
                                        this.plugin.settings.processingPriority.lowPriorityFolders.push(normalizedPath);
                                        await this.plugin.saveSettings();
                                        this.plugin.updateAllFilesDisplay();
                                        
                                        // 清空输入框
                                        textComponent.setValue('');
                                        
                                        // 重新渲染高优先级和低优先级列表
                                        this.renderPriorityFolderList(highPriorityContainer, 'high');
                                        this.renderPriorityFolderList(lowPriorityContainer, 'low');
                                    } else {
                                        new Notice(`目录已在低优先级列表：${normalizedPath}`);
                                    }
                                }
                            });
                        })
                    );
                }));

        // 添加高级设置部分
        containerEl.createEl('h3', {text: '高级设置'});
        
        // 性能监控阈值设置
        new Setting(containerEl)
            .setName('性能监控阈值 (ms)')
            .setDesc('耗时超过此阈值的操作将被记录和警告，可帮助识别性能瓶颈')
            .addSlider(slider => slider
                .setLimits(10, 200, 10)
                .setValue(this.plugin.settings.performanceThreshold)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.performanceThreshold = value;
                    await this.plugin.saveSettings();
                    // 通知插件更新性能监控阈值
                    const event = new CustomEvent('filename-display:update-performance-threshold', {
                        detail: { threshold: value }
                    });
                    window.dispatchEvent(event);
                })
            );
        
        // 缓存清理策略设置
        new Setting(containerEl)
            .setName('缓存清理策略')
            .setDesc('选择缓存清理策略，影响性能和内存使用')
            .addDropdown(dropdown => {
                dropdown
                    .addOption(CacheCleanStrategy.LRU.toString(), '最近最少使用 (LRU)')
                    .addOption(CacheCleanStrategy.FIFO.toString(), '先进先出 (FIFO)')
                    .addOption(CacheCleanStrategy.PRIORITY.toString(), '优先级策略')
                    .setValue(this.plugin.settings.cacheCleanStrategy.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.cacheCleanStrategy = parseInt(value);
                        await this.plugin.saveSettings();
                        // 通知插件更新缓存清理策略
                        const event = new CustomEvent('filename-display:update-cache-strategy', {
                            detail: { strategy: parseInt(value) }
                        });
                        window.dispatchEvent(event);
                        new Notice('缓存清理策略已更新');
                    });
            });
            
        // 新增：自定义缓存策略参数
        containerEl.createEl('h3', {text: '缓存策略参数'});
        
        // 显示名称缓存最大条目数
        new Setting(containerEl)
            .setName('显示名称缓存最大条目数')
            .setDesc('设置显示名称缓存可存储的最大条目数')
            .addSlider(slider => slider
                .setLimits(100, 5000, 100)
                .setValue(this.plugin.settings.cacheSettings.maxDisplayNameEntries)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.cacheSettings.maxDisplayNameEntries = value;
                    await this.plugin.saveSettings();
                    // 通知更新缓存设置
                    const event = new CustomEvent('filename-display:update-cache-settings', {
                        detail: { settings: this.plugin.settings.cacheSettings }
                    });
                    window.dispatchEvent(event);
                })
            );
        
        // 链接缓存最大条目数
        new Setting(containerEl)
            .setName('链接缓存最大条目数')
            .setDesc('设置链接缓存可存储的最大条目数')
            .addSlider(slider => slider
                .setLimits(500, 10000, 500)
                .setValue(this.plugin.settings.cacheSettings.maxLinkEntries)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.cacheSettings.maxLinkEntries = value;
                    await this.plugin.saveSettings();
                    // 通知更新缓存设置
                    const event = new CustomEvent('filename-display:update-cache-settings', {
                        detail: { settings: this.plugin.settings.cacheSettings }
                    });
                    window.dispatchEvent(event);
                })
            );
        
        // 装饰缓存最大条目数
        new Setting(containerEl)
            .setName('装饰缓存最大条目数')
            .setDesc('设置编辑器装饰缓存可存储的最大条目数')
            .addSlider(slider => slider
                .setLimits(200, 5000, 200)
                .setValue(this.plugin.settings.cacheSettings.maxDecorationEntries)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.cacheSettings.maxDecorationEntries = value;
                    await this.plugin.saveSettings();
                    // 通知更新缓存设置
                    const event = new CustomEvent('filename-display:update-cache-settings', {
                        detail: { settings: this.plugin.settings.cacheSettings }
                    });
                    window.dispatchEvent(event);
                })
            );
        
        // 缓存过期时间
        new Setting(containerEl)
            .setName('缓存过期时间 (分钟)')
            .setDesc('设置缓存条目的过期时间，过期后将重新计算')
            .addSlider(slider => slider
                .setLimits(5, 120, 5)
                .setValue(this.plugin.settings.cacheSettings.expiryTime)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.cacheSettings.expiryTime = value;
                    await this.plugin.saveSettings();
                    // 通知更新缓存设置
                    const event = new CustomEvent('filename-display:update-cache-settings', {
                        detail: { settings: this.plugin.settings.cacheSettings }
                    });
                    window.dispatchEvent(event);
                })
            );

        // 新增：调试与诊断设置
        containerEl.createEl('h3', {text: '调试与诊断'});
        
        // 调试模式
        new Setting(containerEl)
            .setName('启用调试模式')
            .setDesc('开启详细日志记录和更多诊断信息。这可能会影响性能。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode || false)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                    
                    // 通知插件更新调试模式
                    if (this.plugin.diagnosticService) {
                        this.plugin.diagnosticService.setDebugMode(value);
                    }
                    
                    new Notice(`调试模式已${value ? '启用' : '禁用'}`);
                })
            );
        
        // 导出诊断信息按钮
        new Setting(containerEl)
            .setName('导出诊断信息')
            .setDesc('导出包含系统状态、性能指标和错误记录的诊断报告')
            .addButton(button => button
                .setButtonText('导出为JSON')
                .onClick(async () => {
                    if (this.plugin.diagnosticService) {
                        const success = await this.plugin.diagnosticService.exportDiagnosticInfo();
                        new Notice(`诊断信息${success ? '已成功导出' : '导出失败'}`);
                    } else {
                        new Notice('诊断服务尚未初始化');
                    }
                })
            )
            .addButton(button => button
                .setButtonText('导出为Markdown')
                .onClick(async () => {
                    if (this.plugin.diagnosticService) {
                        const success = await this.plugin.diagnosticService.exportDiagnosticInfoAsMarkdown();
                        new Notice(`诊断报告${success ? '已成功导出' : '导出失败'}`);
                    } else {
                        new Notice('诊断服务尚未初始化');
                    }
                })
            );
            
        // 性能报告
        new Setting(containerEl)
            .setName('性能报告')
            .setDesc('查看当前性能指标')
            .addButton(button => button
                .setButtonText('查看报告')
                .onClick(() => {
                    if (this.plugin.performanceMonitor) {
                        this.plugin.performanceMonitor.logReport();
                        new Notice('性能报告已输出到控制台。按F12查看。');
                    } else {
                        new Notice('性能监控服务尚未初始化');
                    }
                })
            )
            .addButton(button => button
                .setButtonText('重置统计')
                .onClick(() => {
                    if (this.plugin.performanceMonitor) {
                        this.plugin.performanceMonitor.reset();
                        new Notice('性能统计已重置');
                    } else {
                        new Notice('性能监控服务尚未初始化');
                    }
                })
            );
            
        // 错误报告
        new Setting(containerEl)
            .setName('错误报告')
            .setDesc('查看和清理错误记录')
            .addButton(button => button
                .setButtonText('查看错误')
                .onClick(() => {
                    if (this.plugin.errorHandler) {
                        const errors = this.plugin.errorHandler.getErrorHistory();
                        console.log('错误记录:', errors);
                        new Notice(`发现 ${errors.length} 个错误记录。详情已输出到控制台。`);
                    } else {
                        new Notice('错误处理服务尚未初始化');
                    }
                })
            )
            .addButton(button => button
                .setButtonText('清除错误')
                .onClick(() => {
                    if (this.plugin.errorHandler) {
                        this.plugin.errorHandler.clearAll();
                        new Notice('错误记录已清除');
                    } else {
                        new Notice('错误处理服务尚未初始化');
                    }
                })
            );
    }
    
    // 新增：渲染文件夹列表
    private renderFolderList(containerEl: HTMLElement): void {
        containerEl.empty();
        
        if (this.plugin.settings.enabledFolders.length === 0) {
            containerEl.createEl('div', {
                text: '当前未指定生效目录，插件将对所有文件夹生效。',
                attr: { style: 'margin: 10px 0; font-style: italic;' }
            });
            return;
        }
        
        // 检查是否有空字符串表示全局生效
        if (this.plugin.settings.enabledFolders.includes('')) {
            containerEl.createEl('div', {
                text: '当前设置为对所有文件夹生效。',
                attr: { style: 'margin: 10px 0; font-weight: bold; color: var(--text-accent);' }
            });
            return;
        }
        
        const listEl = containerEl.createEl('ul', {
            attr: { style: 'list-style-type: none; padding: 0;' }
        });
        
        this.plugin.settings.enabledFolders.forEach((folder, index) => {
            const listItem = listEl.createEl('li', {
                attr: { style: 'margin: 8px 0; display: flex; align-items: center;' }
            });
            
            listItem.createEl('span', {
                text: folder || '所有文件夹',
                attr: { style: 'flex-grow: 1;' }
            });
            
            // 删除按钮
            listItem.createEl('button', {
                text: '删除',
                attr: { style: 'margin-left: 8px;' }
            }, (button) => {
                button.addEventListener('click', async () => {
                    this.plugin.settings.enabledFolders.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.plugin.updateAllFilesDisplay();
                    this.renderFolderList(containerEl);
                    new Notice(`已删除目录：${folder || '所有文件夹'}`);
                });
            });
        });
    }

    // 新增：渲染优先级文件夹列表
    private renderPriorityFolderList(containerEl: HTMLElement, priority: 'high' | 'low'): void {
        containerEl.empty();
        
        if (this.plugin.settings.processingPriority[`${priority}PriorityFolders`].length === 0) {
            containerEl.createEl('div', {
                text: `当前未指定${priority === 'high' ? '高优先级' : '低优先级'}文件夹，插件将对所有文件夹生效。`,
                attr: { style: 'margin: 10px 0; font-style: italic;' }
            });
            return;
        }
        
        const listEl = containerEl.createEl('ul', {
            attr: { style: 'list-style-type: none; padding: 0;' }
        });
        
        this.plugin.settings.processingPriority[`${priority}PriorityFolders`].forEach((folder, index) => {
            const listItem = listEl.createEl('li', {
                attr: { style: 'margin: 8px 0; display: flex; align-items: center;' }
            });
            
            listItem.createEl('span', {
                text: folder || '所有文件夹',
                attr: { style: 'flex-grow: 1;' }
            });
            
            // 删除按钮
            listItem.createEl('button', {
                text: '删除',
                attr: { style: 'margin-left: 8px;' }
            }, (button) => {
                button.addEventListener('click', async () => {
                    this.plugin.settings.processingPriority[`${priority}PriorityFolders`].splice(index, 1);
                    await this.plugin.saveSettings();
                    this.plugin.updateAllFilesDisplay();
                    this.renderPriorityFolderList(containerEl, priority);
                    new Notice(`已删除目录：${folder || '所有文件夹'}`);
                });
            });
        });
    }

    // 新增：渲染正则表达式列表
    private renderPatternsList(containerEl: HTMLElement): void {
        containerEl.empty();
        
        if (this.plugin.settings.additionalPatterns.patterns.length === 0) {
            containerEl.createEl('div', {
                text: '当前未添加额外正则表达式。',
                attr: { style: 'margin: 10px 0; font-style: italic;' }
            });
            return;
        }
        
        const listEl = containerEl.createEl('ul', {
            attr: { style: 'list-style-type: none; padding: 0;' }
        });
        
        this.plugin.settings.additionalPatterns.patterns.forEach((pattern, index) => {
            const listItem = listEl.createEl('li', {
                attr: { style: 'margin: 8px 0; display: flex; align-items: center;' }
            });
            
            listItem.createEl('span', {
                text: pattern,
                attr: { style: 'flex-grow: 1;' }
            });
            
            // 删除按钮
            listItem.createEl('button', {
                text: '删除',
                attr: { style: 'margin-left: 8px;' }
            }, (button) => {
                button.addEventListener('click', async () => {
                    this.plugin.settings.additionalPatterns.patterns.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.plugin.updateAllFilesDisplay();
                    this.renderPatternsList(containerEl);
                    new Notice(`已删除正则表达式：${pattern}`);
                });
            });
        });
    }
} 