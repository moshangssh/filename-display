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
	private styleId: string | null = null; // 用于跟踪当前样式

	async onload() {
		await this.loadSettings();
		
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
		if (this.styleId) {
			document.getElementById(this.styleId)?.remove();
		}

		if (!this.settings.enablePlugin) {
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
					/* 文件树导航栏 */
					[data-path="${escapedPath}"] .nav-file-title-content {
						color: transparent !important;
					}
					[data-path="${escapedPath}"] .nav-file-title-content::before {
						content: "${newName}" !important;
					}
					
					/* 编辑器标签页标题 */
					.workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title {
						color: transparent !important;
					}
					.workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title::before {
						content: "${newName}" !important;
					}
					
					/* 文件标题栏 */
					.view-header[data-path="${escapedPath}"] .view-header-title {
						color: transparent !important;
					}
					.view-header[data-path="${escapedPath}"] .view-header-title::before {
						content: "${newName}" !important;
					}
					
					/* 搜索结果和其他位置 */
					.tree-item[data-path="${escapedPath}"] .tree-item-inner {
						color: transparent !important;
					}
					.tree-item[data-path="${escapedPath}"] .tree-item-inner::before {
						content: "${newName}" !important;
					}
				`);
			}
		}

		if (cssRules.length === 0) {
			return;
		}

		// 创建并添加新样式
		const styleEl = document.createElement('style');
		this.styleId = `plugin-custom-style-${Date.now()}`;
		styleEl.id = this.styleId;
		styleEl.textContent = cssRules.join('\n');
		document.head.appendChild(styleEl);
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

