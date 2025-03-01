/**
 * 设置选项卡模块
 * 用于管理插件设置界面
 */
import { App, Notice, PluginSettingTab, Setting, TFolder, normalizePath } from 'obsidian';
import { FileDisplayPluginSettings } from '../types';
import type FileDisplayPlugin from '../../main';

export class FileNameDisplaySettingTab extends PluginSettingTab {
    plugin: FileDisplayPlugin;

    constructor(app: App, plugin: FileDisplayPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('启用插件')
            .setDesc('开启或关闭文件名显示修改')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enablePlugin)
                .onChange(async (value) => {
                    this.plugin.settings.enablePlugin = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('选择生效文件夹')
            .setDesc('选择需要修改显示名称的文件夹（包含子文件夹）')
            .addText(text => text
                .setPlaceholder('输入文件夹路径，例如: folder 或 folder/subfolder')
                .setValue(this.plugin.settings.activeFolder)
                .onChange(async (value) => {
                    try {
                        // 规范化路径
                        const normalizedPath = normalizePath(value.trim());
                        
                        // 验证文件夹是否存在
                        const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
                        
                        if (!folder && value) {
                            new Notice('文件夹不存在');
                            return;
                        }
                        
                        if (folder && !(folder instanceof TFolder)) {
                            new Notice('请输入有效的文件夹路径');
                            return;
                        }
                        
                        this.plugin.settings.activeFolder = normalizedPath;
                        await this.plugin.saveSettings();
                    } catch (error) {
                        console.error('保存设置失败:', error);
                        new Notice('保存设置失败');
                    }
                }));

        new Setting(containerEl)
            .setName('文件名匹配模式')
            .setDesc('输入正则表达式来匹配文件名。使用捕获组()来指定要提取的部分。')
            .addText(text => text
                .setPlaceholder('^(.+?)_\\d{4}_\\d{2}_\\d{2}_(.+)$')
                .setValue(this.plugin.settings.fileNamePattern)
                .onChange(async (value) => {
                    try {
                        // 验证正则表达式的有效性
                        const regex = new RegExp(value);
                        
                        // 测试是否包含至少一个捕获组
                        const testMatch = "test_2024_01_01_title".match(regex);
                        if (!testMatch || testMatch.length <= this.plugin.settings.captureGroup) {
                            new Notice('警告: 正则表达式可能无法捕获指定的组');
                            return;
                        }
                        
                        this.plugin.settings.fileNamePattern = value;
                        await this.plugin.saveSettings();
                    } catch (error) {
                        new Notice('无效的正则表达式');
                    }
                }));

        new Setting(containerEl)
            .setName('显示捕获组')
            .setDesc('选择要显示的正则表达式捕获组的索引（0为完整匹配，1为第一个捕获组，以此类推）')
            .addText(text => text
                .setPlaceholder('2')
                .setValue(String(this.plugin.settings.captureGroup))
                .onChange(async (value) => {
                    const groupIndex = parseInt(value);
                    if (!isNaN(groupIndex) && groupIndex >= 0) {
                        this.plugin.settings.captureGroup = groupIndex;
                        await this.plugin.saveSettings();
                    } else {
                        new Notice('请输入有效的捕获组索引（大于等于0的整数）');
                    }
                }));
                
        // 添加示例说明
        containerEl.createEl('div', {
            text: '示例模式:',
            cls: 'setting-item-description'
        });

        const examples = [
            '^(.+?)_\\d{4}_\\d{2}_\\d{2}_(.+)$ - 匹配 xxx_2024_01_01_标题 格式',
            '^\\d{8}-(.+)$ - 匹配 20240101-标题 格式',
            '^(.+?)-\\d{4}(.+)$ - 匹配 前缀-2024标题 格式'
        ];

        const ul = containerEl.createEl('ul');
        examples.forEach(example => {
            ul.createEl('li', {
                text: example,
                cls: 'setting-item-description'
            });
        });

        // 添加新的设置项
        new Setting(containerEl)
            .setName('显示原始文件名提示')
            .setDesc('当鼠标悬停在链接上时显示原始文件名')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showOriginalNameOnHover)
                .onChange(async (value) => {
                    this.plugin.settings.showOriginalNameOnHover = value;
                    await this.plugin.saveSettings();
                    // 立即刷新编辑器装饰器
                    this.plugin.refreshEditorDecorations();
                }));
    }
}  
