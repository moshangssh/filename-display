import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile, normalizePath } from 'obsidian';
import { FileDisplayPluginSettings, DEFAULT_SETTINGS } from './src/types';
import { FileManager } from './src/services/fileManager';
import { createEditorExtension } from './src/extensions/editorExtension';
import { processMarkdownLinks } from './src/extensions/markdownProcessor';
import { DisplayManager } from './src/services/displayManager';
import { FileNameDisplaySettingTab } from './src/ui/settingsTab';
import { createDebouncedFunction } from './src/utils/helpers';

export default class FileDisplayPlugin extends Plugin {
	settings: FileDisplayPluginSettings;
	private fileManager: FileManager;
	private displayManager: DisplayManager;
	
	// 性能监控
	private updateCount = 0;
	private lastUpdateTime = Date.now();

	async onload() {
		// 加载设置
		await this.loadSettings();
		
		// 初始化服务
		this.fileManager = new FileManager(
			this.app,
			{
				activeFolder: this.settings.activeFolder
			}
		);
		
		this.displayManager = new DisplayManager({
			fileNamePattern: this.settings.fileNamePattern,
			captureGroup: this.settings.captureGroup,
			showOriginalNameOnHover: this.settings.showOriginalNameOnHover
		});
		
		// 使用工具函数创建防抖的文件显示更新函数
		const debouncedUpdateFileDisplay = createDebouncedFunction(
			() => this.updateFileDisplay(),
			'updateFileDisplay',
			500
		);

		// 设置选项卡
		this.addSettingTab(new FileNameDisplaySettingTab(this.app, this));

		// 监听文件变更
		this.fileManager.onFileChange(() => {
			debouncedUpdateFileDisplay();
		});

		// 监听文件打开事件
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				debouncedUpdateFileDisplay();
			})
		);

		// 添加编辑器扩展
		this.registerEditorExtension([
			createEditorExtension(this)
		]);

		// 添加Markdown后处理器
		this.registerMarkdownPostProcessor((el, ctx) => {
			processMarkdownLinks(el, this.settings, this.getUpdatedFileName.bind(this));
		});

		// 添加链接点击事件处理
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			const target = evt.target as HTMLElement;
			if (target.matches('.internal-link, .cm-hmd-internal-link')) {
				// 阻止默认行为
				evt.preventDefault();
				
				// 获取链接文本
				const linkText = target.textContent;
				if (!linkText) return;
				
				// 查找原始文件名
				const originalName = this.displayManager.findOriginalFileName(linkText);
				if (originalName) {
					// 打开正确的文件
					this.openFileByName(originalName);
				}
			}
		});

		// 初始更新显示
		this.updateFileDisplay();
	}

	onunload() {
		// 清理资源
		this.displayManager.destroy();
	}

	// 获取更新后的文件名
	public getUpdatedFileName(originalName: string): string | null {
		return this.displayManager.getUpdatedFileName(originalName);
	}

	// 更新文件显示
	async updateFileDisplay() {
		try {
			if (!this.settings.enablePlugin) {
				this.displayManager.clearStyleSheet();
				return;
			}

			// 检查文件夹路径是否为空
			if (!this.settings.activeFolder) {
				return;
			}

			// 获取活动文件夹
			const folder = this.fileManager.getActiveFolder();
			if (!folder) {
				console.log(`文件夹不存在或无效: ${this.settings.activeFolder}`);
				return;
			}

			// 更新配置
			this.displayManager.updateConfig({
				fileNamePattern: this.settings.fileNamePattern,
				captureGroup: this.settings.captureGroup,
				showOriginalNameOnHover: this.settings.showOriginalNameOnHover
			});
			
			// 获取所有文件
			const files = this.fileManager.getFiles(folder);
			const cssRules = new Map<string, string>();
			
			// 清除旧映射
			this.displayManager.clearNameMapping();
			
			// 批量处理文件以减少重排
			const updates = files.map(file => {
				try {
					const originalName = file.basename;
					const newName = this.displayManager.getUpdatedFileName(originalName);
					
					if (newName !== null) {
						this.displayManager.updateNameMapping(originalName, newName);
						return {
							file,
							newName
						};
					}
					return null;
				} catch (error) {
					console.error(`处理文件失败: ${file.path}`, error);
					return null;
				}
			}).filter(Boolean);

			// 批量更新CSS规则
			updates.forEach(update => {
				if (update) {
					const cssRule = this.displayManager.generateCssRule(update.file, update.newName);
					cssRules.set(update.file.path, cssRule);
				}
			});

			// 更新样式表
			this.displayManager.updateStyleSheet(cssRules);
			
			// 性能监控
			this.updateCount++;
			const now = Date.now();
			if (this.updateCount % 10 === 0) {
				const avgTime = (now - this.lastUpdateTime) / 10;
				console.log(`平均更新时间: ${avgTime}ms`);
				this.lastUpdateTime = now;
			}
		} catch (error) {
			console.error('更新文件显示失败:', error);
			new Notice(`更新文件显示失败: 请检查文件夹路径是否正确`);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// 更新FileManager配置
		this.fileManager.updateConfig({
			activeFolder: this.settings.activeFolder
		});
		
		// 更新显示管理器配置
		this.displayManager.updateConfig({
			fileNamePattern: this.settings.fileNamePattern,
			captureGroup: this.settings.captureGroup,
			showOriginalNameOnHover: this.settings.showOriginalNameOnHover
		});
		
		// 更新显示
		this.updateFileDisplay();
	}

	// 通过文件名打开文件
	private async openFileByName(fileName: string) {
		try {
			await this.fileManager.openFileByName(fileName);
		} catch (error) {
			console.error('打开文件失败:', error);
			new Notice(`打开文件失败: ${error.message}`);
		}
	}

	public refreshEditorDecorations() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			const editor = view.editor;
			editor.refresh();
		}
	}
}

