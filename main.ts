import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile, normalizePath } from 'obsidian';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, PluginValue } from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { WidgetType } from '@codemirror/view';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	activeFolder: string;
	enablePlugin: boolean;
	// 新增配置项
	fileNamePattern: string;  // 文件名匹配模式
	captureGroup: number;     // 要显示的捕获组索引
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	activeFolder: '',
	enablePlugin: true,
	fileNamePattern: '^(.+?)_\\d{4}_\\d{2}_\\d{2}_(.+)$', // 默认保持原来的格式
	captureGroup: 2  // 默认显示第二个捕获组
}

interface FileCacheItem {
	files: TFile[];
	timestamp: number;
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	private styleEl: HTMLStyleElement | null = null;
	private cssRulesCache: Map<string, string> = new Map();
	private fileCache: Map<string, FileCacheItem> = new Map();
	private readonly CACHE_EXPIRE_TIME = 5 * 60 * 1000; // 5分钟过期
	private readonly CACHE_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10分钟清理一次

	async onload() {
		await this.loadSettings();
		
		// 添加设置选项
		this.addSettingTab(new FileNameDisplaySettingTab(this.app, this));

		// 监听文件变化
		this.registerEvent(
			this.app.workspace.on('file-open', () => this.updateFileDisplay())
		);
		this.registerEvent(
			this.app.vault.on('rename', () => {
				this.clearFolderCache();
				this.updateFileDisplay();
			})
		);
		// 添加 create 和 delete 事件监听
		this.registerEvent(
			this.app.vault.on('create', () => {
				this.clearFolderCache();
				this.updateFileDisplay();
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', () => {
				this.clearFolderCache();
				this.updateFileDisplay();
			})
		);

		// 添加编辑器处理
		this.registerEditorExtension([
			this.getEditorExtension()
		]);

		// 添加Markdown后处理器
		this.registerMarkdownPostProcessor((el, ctx) => {
			this.processMarkdownLinks(el);
		});

		// 添加定期清理缓存的定时器
		this.registerInterval(
			window.setInterval(() => this.cleanupCache(), this.CACHE_CLEANUP_INTERVAL)
		);

		// 初始更新显示
		this.updateFileDisplay();
	}

	onunload() {
		if (this.styleEl) {
			this.styleEl.remove();
		}
		this.fileCache.clear();
		super.onunload();
	}

	private getAllFiles(folder: TFolder): TFile[] {
		try {
			const now = Date.now();
			const cacheItem = this.fileCache.get(folder.path);
			
			if (cacheItem && (now - cacheItem.timestamp) < this.CACHE_EXPIRE_TIME) {
				return cacheItem.files;
			}

			let files: TFile[] = [];
			
			const recurseFolder = (folder: TFolder) => {
				try {
					for (const child of folder.children) {
						if (child instanceof TFile) {
							files.push(child);
						} else if (child instanceof TFolder) {
							recurseFolder(child);
						}
					}
				} catch (error) {
					console.error(`遍历文件夹失败: ${folder.path}`, error);
					// 继续处理其他文件夹
				}
			};

			recurseFolder(folder);
			
			this.fileCache.set(folder.path, {
				files: files,
				timestamp: now
			});

			return files;
		} catch (error) {
			console.error('获取文件列表失败:', error);
			return [];
		}
	}

	private getUpdatedFileName(originalName: string): string | null {
		try {
			// 移除文件扩展名
			const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
			
			// 使用配置的正则表达式进行匹配
			const regex = new RegExp(this.settings.fileNamePattern);
			const match = nameWithoutExt.match(regex);
			
			// 如果匹配成功且指定的捕获组存在
			if (match && match[this.settings.captureGroup]) {
				return match[this.settings.captureGroup];
			}
			
			return null;
		} catch (error) {
			// 正则表达式无效时返回null
			console.error('Invalid regex pattern:', error);
			return null;
		}
	}

	private generateCssRule(file: TFile, newName: string): string {
		const escapedPath = CSS.escape(file.path);
		const escapedName = CSS.escape(newName);
		
		return `
			/* 文件树导航栏 */
			[data-path="${escapedPath}"] .nav-file-title-content {
				color: transparent !important;
			}
			[data-path="${escapedPath}"] .nav-file-title-content::before {
				content: "${escapedName}" !important;
			}
			
			/* 编辑器标签页标题 */
			.workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title {
				color: transparent !important;
			}
			.workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title::before {
				content: "${escapedName}" !important;
			}
			
			/* 文件标题栏 */
			.view-header[data-path="${escapedPath}"] .view-header-title {
				color: transparent !important;
			}
			.view-header[data-path="${escapedPath}"] .view-header-title::before {
				content: "${escapedName}" !important;
			}
			
			/* 搜索结果和其他位置 */
			.tree-item[data-path="${escapedPath}"] .tree-item-inner {
				color: transparent !important;
			}
			.tree-item[data-path="${escapedPath}"] .tree-item-inner::before {
				content: "${escapedName}" !important;
			}
		`;
	}

	async updateFileDisplay() {
		try {
			if (!this.settings.enablePlugin) {
				if (this.styleEl) {
					this.styleEl.textContent = '';
				}
				return;
			}

			// 检查文件夹路径是否为空
			if (!this.settings.activeFolder) {
				return;
			}

			const normalizedPath = normalizePath(this.settings.activeFolder);
			const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
			
			// 改进错误处理
			if (!folder) {
				console.log(`文件夹不存在: ${normalizedPath}`);
				return;
			}
			
			if (!(folder instanceof TFolder)) {
				console.log(`路径不是文件夹: ${normalizedPath}`);
				return;
			}

			// 获取所有文件并生成新的CSS规则Map
			const files = this.getAllFiles(folder);
			const newRulesMap = new Map<string, string>();
			
			for (const file of files) {
				try {
					const originalName = file.basename;
					const newName = this.getUpdatedFileName(originalName);
					
					if (newName !== null) {
						const cssRule = this.generateCssRule(file, newName);
						newRulesMap.set(file.path, cssRule);
					}
				} catch (error) {
					console.error(`处理文件失败: ${file.path}`, error);
					// 继续处理其他文件
				}
			}

			// 创建或更新style元素
			try {
				if (!this.styleEl) {
					this.styleEl = document.createElement('style');
					document.head.appendChild(this.styleEl);
				}

				// 比较并只更新变化的规则
				let hasChanges = false;

				// 检查新规则和删除的规则
				newRulesMap.forEach((rule, path) => {
					if (this.cssRulesCache.get(path) !== rule) hasChanges = true;
				});
				this.cssRulesCache.forEach((_, path) => {
					if (!newRulesMap.has(path)) hasChanges = true;
				});

				if (hasChanges) {
					const cssContent = Array.from(newRulesMap.values()).join('\n');
					this.styleEl.textContent = cssContent;
					this.cssRulesCache = newRulesMap;
				}
			} catch (error) {
				console.error('更新样式表失败:', error);
				new Notice('更新文件显示样式失败，请检查控制台获取详细信息');
			}
		} catch (error) {
			console.error('更新文件显示失败:', error);
			// 使用更友好的错误提示
			new Notice(`更新文件显示失败: 请检查文件夹路径是否正确`);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.updateFileDisplay();
	}

	// 处理编辑器中的显示
	private getEditorExtension() {
		const plugin = this;

		// 定义状态字段
		const linkField = StateField.define<DecorationSet>({
			create() {
				const builder = new RangeSetBuilder<Decoration>();
				return builder.finish();
			},
			update(oldState, tr) {
				const builder = new RangeSetBuilder<Decoration>();
				
				if (!plugin.settings.enablePlugin) {
					return Decoration.none;
				}

				const doc = tr.state.doc;
				const linkRegex = /\[\[(.*?)\]\]/g;

				for (let i = 1; i <= doc.lines; i++) {
					const line = doc.line(i);
					const text = line.text;
					let match;

					while ((match = linkRegex.exec(text)) !== null) {
						const originalName = match[1];
						const newName = plugin.getUpdatedFileName(originalName);
						
						if (newName) {
							const from = line.from + match.index + 2;
							const to = from + originalName.length;
							
							builder.add(from, to, Decoration.replace({
								widget: new LinkWidget(newName, originalName)
							}));
						}
					}
				}

				return builder.finish();
			},
			provide: field => EditorView.decorations.from(field)
		});

		// 简化的 ViewPlugin - 只处理视图相关的操作
		class LinkViewPlugin implements PluginValue {
			constructor(view: EditorView) {}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					// 可以在这里添加其他视图相关的操作
				}
			}

			destroy() {}
		}

		return [
			linkField,
			ViewPlugin.fromClass(LinkViewPlugin)
		];
	}

	// 处理阅读视图中的链接
	private processMarkdownLinks(el: HTMLElement) {
		if (!this.settings.enablePlugin) return;

		try {
			const links = Array.from(el.querySelectorAll('a.internal-link'));
			for (const link of links) {
				try {
					const originalName = link.getAttribute('data-href');
					if (!originalName) continue;

					const newName = this.getUpdatedFileName(originalName);
					if (newName) {
						link.textContent = newName;
					}
				} catch (error) {
					console.error(`处理链接失败: ${link.getAttribute('data-href')}`, error);
					// 继续处理其他链接
				}
			}
		} catch (error) {
			console.error('处理Markdown链接失败:', error);
		}
	}

	// 清理指定文件夹的缓存
	private clearFolderCache() {
		const activeFolder = this.settings.activeFolder;
		if (activeFolder) {
			const normalizedPath = normalizePath(activeFolder);
			this.fileCache.delete(normalizedPath);
		}
	}

	// 清理过期缓存
	private cleanupCache() {
		const now = Date.now();
		for (const [path, cacheItem] of this.fileCache) {
			if (now - cacheItem.timestamp > this.CACHE_EXPIRE_TIME) {
				this.fileCache.delete(path);
			}
		}
	}
}

// 自定义链接部件
class LinkWidget extends WidgetType {
	constructor(readonly displayText: string, readonly originalText: string) {
		super();
	}

	toDOM() {
		const span = document.createElement('span');
		span.textContent = this.displayText;
		span.className = 'cm-link';
		// 保存原始文本用于复制等操作
		span.setAttribute('data-original-text', this.originalText);
		return span;
	}

	ignoreEvent() {
		return false;
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
						new RegExp(value);
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
	}
}

