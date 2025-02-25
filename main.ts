import { Plugin } from 'obsidian';
import { FileNameDisplayPlugin } from './src/core/plugin';
import { DEFAULT_SETTINGS } from './src/core/plugin';
import { MyPluginSettings } from './src/types/interfaces';

export default class MyPlugin extends Plugin {
	private plugin: FileNameDisplayPlugin;
	settings: MyPluginSettings;

	async onload() {
		// 加载设置
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		
		// 初始化核心插件实例
		this.plugin = new FileNameDisplayPlugin(this.app, this);
		
		// 加载插件
		await this.plugin.onload();
	}

	onunload() {
		this.plugin.onunload();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.plugin.updateFileDisplay();
	}
}

