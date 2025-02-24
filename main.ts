import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile, normalizePath } from 'obsidian';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, PluginValue } from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { WidgetType } from '@codemirror/view';

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

		// 添加编辑器处理
		this.registerEditorExtension([
			this.getEditorExtension()
		]);

		// 添加Markdown后处理器
		this.registerMarkdownPostProcessor((el, ctx) => {
			this.processMarkdownLinks(el);
		});

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

		const links = Array.from(el.querySelectorAll('a.internal-link'));
		for (const link of links) {
			const originalName = link.getAttribute('data-href');
			if (!originalName) continue;

			const newName = this.getUpdatedFileName(originalName);
			if (newName) {
				link.textContent = newName;
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
				.setPlaceholder('输入文件夹路径，例如: AIGC')
				.setValue(this.plugin.settings.activeFolder)
				.onChange(async (value) => {
					// 保存设置前规范化路径
					this.plugin.settings.activeFolder = normalizePath(value);
					await this.plugin.saveSettings();
				}));
	}
}

