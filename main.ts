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
	maxCacheSize: number;    // 最大缓存大小(MB)
	batchSize: number;        // 文件遍历批次大小
	// 添加新的设置项
	showOriginalNameOnHover: boolean;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	activeFolder: '',
	enablePlugin: true,
	fileNamePattern: '^(.+?)_\\d{4}_\\d{2}_\\d{2}_(.+)$', // 默认保持原来的格式
	captureGroup: 2,     // 默认显示第二个捕获组
	maxCacheSize: 100,   // 默认100MB
	batchSize: 1000,      // 每批处理1000个文件
	// 设置默认值为 true
	showOriginalNameOnHover: true
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
	
	// 添加性能监控计数器
	private updateCount = 0;
	private lastUpdateTime = Date.now();
	
	// 添加防抖函数
	private debouncedUpdateFileDisplay = this.debounce(() => {
		this.updateFileDisplay();
		
		// 性能监控
		this.updateCount++;
		const now = Date.now();
		if (now - this.lastUpdateTime > 60000) { // 每分钟记录一次
			console.log(`File display updates in last minute: ${this.updateCount}`);
			this.updateCount = 0;
			this.lastUpdateTime = now;
		}
	}, 500);

	// 实现防抖函数
	private debounce(func: Function, wait: number) {
		let timeout: NodeJS.Timeout;
		return (...args: any[]) => {
			const later = () => {
				clearTimeout(timeout);
				func.apply(this, args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}

	// 添加名称映射缓存
	private nameMapping: Map<string, string> = new Map();

	async onload() {
		await this.loadSettings();
		
		// 添加设置选项
		this.addSettingTab(new FileNameDisplaySettingTab(this.app, this));

		// 修改事件监听,使用防抖
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				this.debouncedUpdateFileDisplay();
			})
		);

		this.registerEvent(
			this.app.vault.on('rename', () => {
				this.clearFolderCache();
				this.debouncedUpdateFileDisplay();
			})
		);

		this.registerEvent(
			this.app.vault.on('create', () => {
				this.clearFolderCache();
				this.debouncedUpdateFileDisplay();
			})
		);

		this.registerEvent(
			this.app.vault.on('delete', () => {
				this.clearFolderCache();
				this.debouncedUpdateFileDisplay();
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
				const originalName = this.findOriginalFileName(linkText);
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
		if (this.styleEl) {
			this.styleEl.remove();
		}
		this.fileCache.clear();
		super.onunload();
	}

	private cacheStats = {
		totalSize: 0,
		itemCount: 0,
		lastCleanup: Date.now()
	};
	
	private weakFileRefs = new WeakMap<TFile, number>();
	
	// 改进的缓存清理方法
	private cleanupCache() {
		try {
			const now = Date.now();
			let cleanupCount = 0;
			let freedSize = 0;
			
			// 时间和大小双重检查
			for (const [path, cacheItem] of this.fileCache) {
				const isExpired = now - cacheItem.timestamp > this.CACHE_EXPIRE_TIME;
				const itemSize = this.estimateItemSize(cacheItem);
				
				if (isExpired || this.cacheStats.totalSize + itemSize > this.settings.maxCacheSize * 1024 * 1024) {
					this.fileCache.delete(path);
					this.cacheStats.totalSize -= itemSize;
					this.cacheStats.itemCount--;
					cleanupCount++;
					freedSize += itemSize;
				}
			}
			
			if (cleanupCount > 0) {
				console.log(`[Filename Display] Cache cleanup: removed ${cleanupCount} items, freed ${(freedSize/1024/1024).toFixed(2)}MB`);
			}
			
			this.cacheStats.lastCleanup = now;
		} catch (error) {
			console.error('[Filename Display] Cache cleanup failed:', error);
		}
	}
	
	// 估算缓存项大小
	private estimateItemSize(item: FileCacheItem): number {
		// 基础结构大小
		let size = 40; // Map entry overhead
		
		// 文件引用大小
		size += item.files.length * 32; // 每个TFile引用约32字节
		
		// 时间戳大小
		size += 8;
		
		return size;
	}
	
	// 改进的文件遍历方法
	private async getAllFiles(folder: TFolder): Promise<TFile[]> {
		try {
			const now = Date.now();
			const cacheItem = this.fileCache.get(folder.path);
			
			if (cacheItem && (now - cacheItem.timestamp) < this.CACHE_EXPIRE_TIME) {
				return cacheItem.files;
			}
			
			const files: TFile[] = [];
			
			// 使用迭代器进行分批处理
			const processFiles = async (folder: TFolder) => {
				let batch: TFile[] = [];
				
				const processBatch = async () => {
					if (batch.length > 0) {
						files.push(...batch);
						batch = [];
						// 让出主线程
						await new Promise(resolve => setTimeout(resolve, 0));
					}
				};
				
				for (const child of folder.children) {
					if (child instanceof TFile) {
						batch.push(child);
						this.weakFileRefs.set(child, now);
						
						if (batch.length >= this.settings.batchSize) {
							await processBatch();
						}
					} else if (child instanceof TFolder) {
						await processBatch(); // 处理当前批次
						await processFiles(child);
					}
				}
				
				await processBatch(); // 处理剩余文件
			};
			
			await processFiles(folder);
			
			// 更新缓存和统计
			const itemSize = this.estimateItemSize({files, timestamp: now});
			this.cacheStats.totalSize += itemSize;
			this.cacheStats.itemCount++;
			
			this.fileCache.set(folder.path, {
				files,
				timestamp: now
			});
			
			return files;
		} catch (error) {
			console.error('[Filename Display] Failed to get files:', error);
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
			
			// 验证捕获组索引是否有效
			if (match && this.settings.captureGroup >= 0 && this.settings.captureGroup < match.length) {
				const result = match[this.settings.captureGroup];
				// 确保结果不为空
				return result?.trim() || this.getFallbackName(nameWithoutExt);
			}
			
			// 如果匹配失败或捕获组无效，使用回退名称
			return this.getFallbackName(nameWithoutExt);
		} catch (error) {
			// 记录错误并使用回退名称
			console.error('文件名处理错误:', error);
			return this.getFallbackName(originalName);
		}
	}

	// 新增回退显示方法
	private getFallbackName(originalName: string): string {
		// 如果原始名称过长，截取合适长度
		const MAX_LENGTH = 30;
		if (originalName.length > MAX_LENGTH) {
			return originalName.substring(0, MAX_LENGTH - 3) + '...';
		}
		return originalName;
	}

	private generateCssRule(file: TFile, newName: string): string {
		const escapedPath = CSS.escape(file.path);
		const escapedName = CSS.escape(newName);
		
		return `
			/* 文件树导航栏 */
			[data-path="${escapedPath}"] .nav-file-title-content {
				color: transparent;
			}
			[data-path="${escapedPath}"] .nav-file-title-content::before {
				content: "${escapedName}";
			}
			
			/* 编辑器标签页标题 */
			.workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title {
				color: transparent;
			}
			.workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title::before {
				content: "${escapedName}";
			}
			
			/* 文件标题栏 */
			.view-header[data-path="${escapedPath}"] .view-header-title {
				color: transparent;
			}
			.view-header[data-path="${escapedPath}"] .view-header-title::before {
				content: "${escapedName}";
			}
			
			/* 搜索结果和其他位置 */
			.tree-item[data-path="${escapedPath}"] .tree-item-inner {
				color: transparent;
			}
			.tree-item[data-path="${escapedPath}"] .tree-item-inner::before {
				content: "${escapedName}";
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
			const files = await this.getAllFiles(folder);
			const newRulesMap = new Map<string, string>();
			
			// 清除旧映射
			this.nameMapping.clear();
			
			for (const file of files) {
				try {
					const originalName = file.basename;
					const newName = this.getUpdatedFileName(originalName);
					
					if (newName !== null) {
						// 添加双向映射
						this.nameMapping.set(newName, originalName);
						this.nameMapping.set(originalName, originalName);
						
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

		// 添加状态字段来缓存链接位置
		const linkCache = StateField.define<DecorationSet>({
			create() {
				return Decoration.none;
			},
			update(oldState, tr) {
				if (!plugin.settings.enablePlugin) {
					return Decoration.none;
				}

				// 只在文档变化或首次加载时更新
				if (!tr.docChanged && oldState.size) {
					return oldState;
				}

				const builder = new RangeSetBuilder<Decoration>();
				const doc = tr.state.doc;

				// 遍历文档查找链接
				let inCodeBlock = false;
				for (let i = 1; i <= doc.lines; i++) {
					const line = doc.line(i);
					const text = line.text;

					// 检查是否在代码块内
					if (text.startsWith("```")) {
						inCodeBlock = !inCodeBlock;
						continue;
					}

					// 跳过代码块内容
					if (inCodeBlock) continue;

					// 使用正则匹配所有可能的链接格式
					const linkRegex = /\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^\)]+)\)/g;
					let match;

					while ((match = linkRegex.exec(text)) !== null) {
						try {
							const linkText = match[1] || match[2];
							const from = line.from + match.index + (match[1] ? 2 : 1);
							const to = from + linkText.length;

							// 获取新的显示名称
							const newName = plugin.getUpdatedFileName(linkText);
							
							if (newName && newName !== linkText) {
								// 创建链接装饰器
								builder.add(from, to, Decoration.replace({
									widget: new EnhancedLinkWidget(newName, linkText, plugin.settings)
								}));
							}
						} catch (error) {
							console.error("处理链接失败:", error);
						}
					}
				}

				return builder.finish();
			},
			provide: field => EditorView.decorations.from(field)
		});

		// 优化的链接部件
		class EnhancedLinkWidget extends WidgetType {
			constructor(readonly displayText: string, readonly originalText: string, readonly settings: MyPluginSettings) {
				super();
			}

			toDOM() {
				const container = document.createElement('span');
				container.className = 'enhanced-link-widget';
				
				// 显示新名称
				const display = document.createElement('span');
				display.textContent = this.displayText;
				display.className = 'link-display cm-hmd-internal-link';
				container.appendChild(display);

				// 根据设置决定是否添加提示
				if (this.settings.showOriginalNameOnHover) {
					const tooltip = document.createElement('span');
					tooltip.textContent = this.originalText;
					tooltip.className = 'link-tooltip';
					container.appendChild(tooltip);
				}

				// 保存原始文本用于复制等操作
				container.dataset.originalText = this.originalText;

				return container;
			}

			eq(other: EnhancedLinkWidget): boolean {
				return other.displayText === this.displayText && 
					   other.originalText === this.originalText &&
					   other.settings.showOriginalNameOnHover === this.settings.showOriginalNameOnHover;
			}

			ignoreEvent(): boolean {
				return false;
			}
		}

		// 添加相应的CSS样式
		const linkStyles = EditorView.baseTheme({
			'.enhanced-link-widget': {
				position: 'relative',
				display: 'inline-block'
			},
			'.link-display': {
				color: 'var(--text-accent)',
				textDecoration: 'underline',
				cursor: 'pointer'
			},
			'.link-tooltip': {
				display: 'none',
				position: 'absolute',
				bottom: '100%',
				left: '50%',
				transform: 'translateX(-50%)',
				padding: '4px 8px',
				backgroundColor: 'var(--background-modifier-hover)',
				borderRadius: '4px',
				fontSize: '12px',
				zIndex: '100'
			},
			'.enhanced-link-widget:hover .link-tooltip': {
				display: 'block'
			}
		});

		return [linkCache, linkStyles];
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

	public getCacheStats() {
		return {
			itemCount: this.cacheStats.itemCount,
			totalSize: this.cacheStats.totalSize
		};
	}

	// 查找原始文件名
	private findOriginalFileName(displayName: string): string | null {
		return this.nameMapping.get(displayName) || null;
	}

	// 打开文件
	private async openFileByName(fileName: string) {
		try {
			// 在活动文件夹中查找文件
			const folder = this.app.vault.getAbstractFileByPath(this.settings.activeFolder);
			if (!(folder instanceof TFolder)) return;
			
			const files = await this.getAllFiles(folder);
			const targetFile = files.find(f => f.basename === fileName);
			
			if (targetFile) {
				// 在新叶子中打开文件
				const leaf = this.app.workspace.getLeaf(true);
				await leaf.openFile(targetFile);
			} else {
				new Notice(`未找到文件: ${fileName}`);
			}
		} catch (error) {
			console.error('打开文件失败:', error);
			new Notice('打开文件失败');
		}
	}

	// 在 MyPlugin 类中添加一个方法来刷新编辑器视图
	public refreshEditorDecorations() {
		// 获取所有编辑器视图
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
						
						// 测试是否包含至少一个捕获组
						const testMatch = "test_2024_01_01_title".match(new RegExp(value));
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

		new Setting(containerEl)
			.setName('最大缓存大小')
			.setDesc('设置文件缓存的最大大小(MB)')
			.addText(text => text
				.setPlaceholder('100')
				.setValue(String(this.plugin.settings.maxCacheSize))
				.onChange(async (value) => {
					const size = parseInt(value);
					if (!isNaN(size) && size > 0) {
						this.plugin.settings.maxCacheSize = size;
						await this.plugin.saveSettings();
					}
				}));
				
		new Setting(containerEl)
			.setName('批处理大小')
			.setDesc('每批处理的文件数量(影响性能)')
			.addText(text => text
				.setPlaceholder('1000')
				.setValue(String(this.plugin.settings.batchSize))
				.onChange(async (value) => {
					const size = parseInt(value);
					if (!isNaN(size) && size > 0) {
						this.plugin.settings.batchSize = size;
						await this.plugin.saveSettings();
					}
				}));
				
		// 添加缓存统计信息显示
		const stats = this.plugin.getCacheStats();
		const statsEl = containerEl.createEl('div', {
			cls: 'setting-item-description',
			text: `缓存统计: ${stats.itemCount} 项, ${(stats.totalSize/1024/1024).toFixed(2)}MB`
		});

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

