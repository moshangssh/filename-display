import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { FileNameDisplayPlugin } from '../../core/plugin';
import { ValidationHelper } from '../../utils/validation';
import { PathHelper } from '../../utils/path-helper';

export class FileNameDisplaySettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: FileNameDisplayPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this.addBasicSettings(containerEl);
        this.addPatternSettings(containerEl);
        this.addPerformanceSettings(containerEl);
        this.addDisplaySettings(containerEl);
        this.addExamples(containerEl);
    }

    private addBasicSettings(containerEl: HTMLElement): void {
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
                .setPlaceholder('输入文件夹路径')
                .setValue(this.plugin.settings.activeFolder)
                .onChange(async (value) => {
                    const normalizedPath = PathHelper.normalize(value.trim());
                    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

                    if (!folder && value) {
                        new Notice('文件夹不存在');
                        return;
                    }

                    if (folder && !ValidationHelper.isValidFolder(folder)) {
                        new Notice('请输入有效的文件夹路径');
                        return;
                    }

                    this.plugin.settings.activeFolder = normalizedPath;
                    await this.plugin.saveSettings();
                }));
    }

    private addPatternSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('文件名匹配模式')
            .setDesc('输入正则表达式来匹配文件名')
            .addText(text => text
                .setPlaceholder('^(.+?)_\\d{4}_\\d{2}_\\d{2}_(.+)$')
                .setValue(this.plugin.settings.fileNamePattern)
                .onChange(async (value) => {
                    if (!ValidationHelper.isValidRegex(value)) {
                        new Notice('无效的正则表达式');
                        return;
                    }
                    this.plugin.settings.fileNamePattern = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('显示捕获组')
            .setDesc('选择要显示的正则表达式捕获组的索引')
            .addText(text => text
                .setPlaceholder('2')
                .setValue(String(this.plugin.settings.captureGroup))
                .onChange(async (value) => {
                    if (!ValidationHelper.isValidNumber(value, 0)) {
                        new Notice('请输入有效的捕获组索引');
                        return;
                    }
                    this.plugin.settings.captureGroup = parseInt(value);
                    await this.plugin.saveSettings();
                }));
    }

    private addPerformanceSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('最大缓存大小')
            .setDesc('设置文件缓存的最大大小(MB)')
            .addText(text => text
                .setPlaceholder('100')
                .setValue(String(this.plugin.settings.maxCacheSize))
                .onChange(async (value) => {
                    if (!ValidationHelper.isValidNumber(value, 1)) {
                        new Notice('请输入有效的缓存大小');
                        return;
                    }
                    this.plugin.settings.maxCacheSize = parseInt(value);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('批处理大小')
            .setDesc('每批处理的文件数量(影响性能)')
            .addText(text => text
                .setPlaceholder('1000')
                .setValue(String(this.plugin.settings.batchSize))
                .onChange(async (value) => {
                    if (!ValidationHelper.isValidNumber(value, 1)) {
                        new Notice('请输入有效的批处理大小');
                        return;
                    }
                    this.plugin.settings.batchSize = parseInt(value);
                    await this.plugin.saveSettings();
                }));
    }

    private addDisplaySettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('显示原始文件名提示')
            .setDesc('当鼠标悬停在链接上时显示原始文件名')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showOriginalNameOnHover)
                .onChange(async (value) => {
                    this.plugin.settings.showOriginalNameOnHover = value;
                    await this.plugin.saveSettings();
                }));
    }

    private addExamples(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '示例模式' });
        const examples = [
            '^(.+?)_\\d{4}_\\d{2}_\\d{2}_(.+)$ - 匹配 xxx_2024_01_01_标题 格式',
            '^\\d{8}-(.+)$ - 匹配 20240101-标题 格式',
            '^(.+?)-\\d{4}(.+)$ - 匹配 前缀-2024标题 格式'
        ];

        const ul = containerEl.createEl('ul');
        examples.forEach(example => {
            ul.createEl('li', { text: example });
        });
    }
}

