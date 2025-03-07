import { App, PluginSettingTab, Setting, Plugin, normalizePath, Notice } from 'obsidian';
import type { FilenameDisplaySettings } from '../types';

interface IFilenameDisplayPlugin extends Plugin {
    settings: FilenameDisplaySettings;
    saveSettings(): Promise<void>;
    updateAllFilesDisplay(): void;
}

export class FilenameDisplaySettingTab extends PluginSettingTab {
    plugin: IFilenameDisplayPlugin;

    constructor(app: App, plugin: IFilenameDisplayPlugin) {
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
                
        // 新增：指定生效目录设置
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
} 