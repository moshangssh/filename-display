import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile, normalizePath } from 'obsidian';
import { FileDisplayPluginSettings, DEFAULT_SETTINGS } from './src/types';
import { FileManager } from './src/utils/fileManager';
import { createEditorExtension } from './src/extensions/editorExtension';
import { processMarkdownLinks } from './src/extensions/markdownProcessor';
import { CacheManager } from './src/services/cacheManager';
import { DisplayManager } from './src/services/displayManager';
import { FileNameDisplaySettingTab } from './src/ui/settingsTab';
import { createDebouncedFunction } from './src/utils/helpers';

export default class FileDisplayPlugin extends Plugin {
	settings: FileDisplayPluginSettings;
	private fileManager: FileManager;
	private cacheManager: CacheManager;
	private displayManager: DisplayManager;
	
	// 性能监控
	private updateCount = 0;
	private lastUpdateTime = Date.now();

	async onload() {
		// 加载设置
		await this.loadSettings();
		
		// 初始化服务
		this.cacheManager = new CacheManager({
			maxCacheSize: this.settings.maxCacheSize,
			expireTime: 5 * 60 * 1000,
			cleanupInterval: 10 * 60 * 1000
		});
		
		this.fileManager = new FileManager(
			this.app,
			this.cacheManager,
			this.settings
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

		// 事件监听
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				debouncedUpdateFileDisplay();
			})
		);

		this.registerEvent(
			this.app.vault.on('rename', () => {
				this.fileManager.clearFolderCache(this.settings.activeFolder);
				debouncedUpdateFileDisplay();
			})
		);

		this.registerEvent(
			this.app.vault.on('create', () => {
				this.fileManager.clearFolderCache(this.settings.activeFolder);
				debouncedUpdateFileDisplay();
			})
		);

		this.registerEvent(
			this.app.vault.on('delete', () => {
				this.fileManager.clearFolderCache(this.settings.activeFolder);
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

		// 添加定期清理缓存的定时器
		this.registerInterval(
			window.setInterval(() => this.cacheManager.cleanup(), 10 * 60 * 1000)
		);

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
		this.cacheManager.clearAllCache();
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

			// 直接使用 app.vault 获取文件夹对象而不是调用 getActiveFolder
			const normalizedPath = normalizePath(this.settings.activeFolder);
			const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
			
			if (!folder || !(folder instanceof TFolder)) {
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
			const files = await this.fileManager.getAllFiles(folder);
			const cssRules = new Map<string, string>();
			
			// 清除旧映射
			this.displayManager.clearNameMapping();
			
			// 处理每个文件
			for (const file of files) {
				try {
					const originalName = file.basename;
					const newName = this.displayManager.getUpdatedFileName(originalName);
					
					if (newName !== null) {
						// 更新映射和CSS规则
						this.displayManager.updateNameMapping(originalName, newName);
						const cssRule = this.displayManager.generateCssRule(file, newName);
						cssRules.set(file.path, cssRule);
					}
				} catch (error) {
					console.error(`处理文件失败: ${file.path}`, error);
				}
			}

			// 更新样式表
			this.displayManager.updateStyleSheet(cssRules);
			
			// 性能监控
			this.updateCount++;
			const now = Date.now();
			if (now - this.lastUpdateTime > 60000) {
				console.log(`文件显示更新计数 (最近一分钟): ${this.updateCount}`);
				this.updateCount = 0;
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
		
		// 更新缓存管理器配置
		this.cacheManager.updateConfig({
			maxCacheSize: this.settings.maxCacheSize
		});
		
		// 更新显示管理器配置
		this.displayManager.updateConfig({
			fileNamePattern: this.settings.fileNamePattern,
			captureGroup: this.settings.captureGroup,
			showOriginalNameOnHover: this.settings.showOriginalNameOnHover
		});
		
		// 直接应用新设置，而不是调用不存在的updateConfig方法
		this.updateFileDisplay();
	}

	// 通过文件名打开文件
	private async openFileByName(fileName: string) {
		try {
			// 获取活动文件夹
			const normalizedPath = normalizePath(this.settings.activeFolder);
			const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (!folder || !(folder instanceof TFolder)) {
				new Notice(`无效的活动文件夹`);
				return;
			}
			
			// 获取所有文件并查找匹配项
			const files = await this.fileManager.getAllFiles(folder);
			const file = files.find(f => f.basename === fileName);
			
			if (file) {
				// 使用 app.workspace 打开文件
				const leaf = this.app.workspace.getLeaf(true);
				await leaf.openFile(file);
			} else {
				new Notice(`未找到文件: ${fileName}`);
			}
		} catch (error) {
			console.error('打开文件失败:', error);
			new Notice('打开文件失败');
		}
	}

	// 获取缓存统计信息
	public getCacheStats() {
		return this.cacheManager.getStats();
	}

	// 刷新编辑器视图方法
	public refreshEditorDecorations() {
		this.app.workspace.iterateAllLeaves(leaf => {
			if (leaf.view instanceof MarkdownView && leaf.view.editor) {
				// 触发编辑器内容更新
				const editor = leaf.view.editor;
				const doc = editor.getValue();
				editor.setValue(doc);
			}
		});
	}
}

