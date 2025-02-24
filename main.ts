import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile, normalizePath } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	activeFolder: string;
	enablePlugin: boolean; // 添加开关选项
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	activeFolder: '',
	enablePlugin: true
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	private styleElement: HTMLStyleElement;

	async onload() {
		await this.loadSettings();
		
		// 创建并添加样式元素
		this.styleElement = document.createElement('style');
		document.head.appendChild(this.styleElement);

		// 添加设置选项
		this.addSettingTab(new FileNameDisplaySettingTab(this.app, this));

		// 监听文件变化
		this.registerEvent(
			this.app.workspace.on('file-open', () => this.updateFileDisplay())
		);
		this.registerEvent(
			this.app.vault.on('rename', () => this.updateFileDisplay())
		);

		// 初始更新显示
		this.updateFileDisplay();
	}

	onunload() {
		// 清理样式
		this.styleElement.remove();
		
		// 调用父类的 onunload 以确保事件监听器被正确注销
		super.onunload();
	}

	private getAllFiles(folder: TFolder): TFile[] {
		let files: TFile[] = [];
		
		// 递归获取所有文件
		const recurseFolder = (folder: TFolder) => {
			for (const child of folder.children) {
				if (child instanceof TFile) {
					files.push(child);
				} else if (child instanceof TFolder) {
					recurseFolder(child);
				}
			}
		};

		recurseFolder(folder);
		return files;
	}

	private getUpdatedFileName(originalName: string): string | null {
		// 移除文件扩展名
		const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
		
		// 检查是否匹配 xxx_YYYY_MM_DD_ 格式
		const match = nameWithoutExt.match(/^(.+?)_\d{4}_\d{2}_\d{2}_(.+)$/);
		
		// 如果匹配返回新名称，否则返回null
		return match ? match[2] : null; // 返回名称部分
	}

	async updateFileDisplay() {
		if (!this.settings.enablePlugin) {
			this.styleElement.textContent = '';
			return;
		}

		// 规范化路径
		const normalizedPath = normalizePath(this.settings.activeFolder);
		const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(folder instanceof TFolder)) {
			return;
		}

		let cssRules = [];
		const files = this.getAllFiles(folder);

		for (const file of files) {
			const originalName = file.basename;
			const newName = this.getUpdatedFileName(originalName);
			
			if (newName !== null) {
				const escapedPath = CSS.escape(file.path);
				cssRules.push(`
					[data-path="${escapedPath}"] .nav-file-title-content {
						position: relative !important;
						color: transparent !important;
					}
					[data-path="${escapedPath}"] .nav-file-title-content::before {
						content: "${newName}" !important;
						position: absolute !important;
						left: 0 !important;
						color: var(--nav-item-color) !important;
					}
				`);
			}
		}

		if (cssRules.length === 0) {
			this.styleElement.textContent = '';
			return;
		}

		// 添加基础样式
		cssRules.unshift(`
			.nav-file-title-content {
				position: relative !important;
			}
		`);

		this.styleElement.textContent = cssRules.join('\n');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateFileDisplay();
	}
}

class FileNameDisplaySettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
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
				.setPlaceholder('输入文件夹路径，例如: AIGC')
				.setValue(this.plugin.settings.activeFolder)
				.onChange(async (value) => {
					// 保存设置前规范化路径
					this.plugin.settings.activeFolder = normalizePath(value);
					await this.plugin.saveSettings();
				}));
	}
}

