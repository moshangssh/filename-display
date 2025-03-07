import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';
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
    }
} 