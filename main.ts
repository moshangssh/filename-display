import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile, normalizePath } from 'obsidian';
import { FileDisplayPluginSettings, DEFAULT_SETTINGS } from './src/types/index';
import { FileManager } from './src/services/fileManager';
import { processMarkdownLinks } from './src/extensions/markdownProcessor';
import { FileNameDisplaySettingTab } from './src/ui/settingsTab';
import { DecorationManager } from './src/services/decorationManager';
import { RegexCache } from './src/utils/regexCache';
import { FileEventType } from './src/services/eventBus';
import { widgetStyles } from './src/styles/widgetStyles';
import { PerformanceMonitor } from './src/utils/performanceMonitor';
import { DOMObserverService } from './src/services/legacyAdapters';
import { LinkClickHandlerService } from './src/services/linkClickHandlerService';
import { UnifiedDOMObserver } from './src/services/unifiedDOMObserver';

export default class FileDisplayPlugin extends Plugin {
	settings: FileDisplayPluginSettings;
	private fileManager: FileManager;
	private decorationManager: DecorationManager;
	private domObserver: DOMObserverService;
	private linkClickHandler: LinkClickHandlerService;
	private performanceMonitor: PerformanceMonitor;
	private editorExtension: any[];
	private unifiedObserver: UnifiedDOMObserver;
	
	// 事件取消订阅函数
	private unsubscribes: Array<() => void> = [];

	async onload() {
		// 加载设置
		await this.loadSettings();
		
		// 初始化性能监控器
		this.performanceMonitor = new PerformanceMonitor();
		
		// 初始化服务
		this.initServices();
		
		// 设置选项卡
		this.addSettingTab(new FileNameDisplaySettingTab(this.app, this));

		// 设置事件监听
		this.setupEventHandlers();
		
		// 添加编辑器扩展
		this.registerEditorExtension(this.editorExtension);

		// 添加Markdown后处理器
		this.registerMarkdownPostProcessor((el, ctx) => {
			processMarkdownLinks(el, this.settings, this.getUpdatedFileName.bind(this));
		});

		// 初始更新显示
		this.updateFileDisplay();
		
		// 记录插件加载完成
		console.log('文件名显示插件已加载 - 优化版本 (原生事件系统)');
	}
	
	/**
	 * 初始化各种服务
	 */
	private initServices(): void {
		// 初始化统一DOM观察系统（最先初始化，以便其他服务使用）
		this.unifiedObserver = new UnifiedDOMObserver(this.app);
		
		// 设置全局实例，以便适配器类访问
		window.activeUnifiedObserver = this.unifiedObserver;
		
		// 初始化文件管理器
		this.fileManager = new FileManager(
			this.app,
			{
				activeFolder: this.settings.activeFolder
			}
		);
		
		// 初始化装饰管理器
		this.decorationManager = new DecorationManager(
			this.app,
			{
				fileNamePattern: this.settings.fileNamePattern,
				captureGroup: this.settings.captureGroup,
				showOriginalNameOnHover: this.settings.showOriginalNameOnHover
			}
		);
		
		// 初始化DOM观察器（使用适配器版本，内部使用统一观察器）
		this.domObserver = new DOMObserverService(
			this.updateFileDisplay.bind(this)
		);
		
		// 初始化链接点击处理器
		this.linkClickHandler = new LinkClickHandlerService(
			this.decorationManager,
			this.openFileByName.bind(this)
		);
		
		// 更新正则缓存设置
		RegexCache.getInstance().updateSettings();
		
		// 创建编辑器扩展，包含统一的样式
		this.editorExtension = [
			this.decorationManager.createEditorViewPlugin(),
			widgetStyles
		];
	}
	
	/**
	 * 设置事件监听器
	 */
	private setupEventHandlers(): void {
		// 注册链接点击处理器
		this.register(this.linkClickHandler.register());
		
		// 注册DOM观察器
		this.register(this.domObserver.observe());
		
		// 监听文件打开事件
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				this.updateFileDisplay();
			})
		);
		
		// 设置文件事件订阅
		this.setupEventSubscriptions();
	}
	
	/**
	 * 设置事件订阅
	 */
	private setupEventSubscriptions() {
		// 清理可能存在的旧订阅
		this.clearEventSubscriptions();
		
		// 订阅激活文件夹的所有事件
		const folderPath = this.settings.activeFolder;
		if (folderPath) {
			// 订阅文件夹事件
			const unsubscribe = this.fileManager.onFolderEvents(folderPath, event => {
				console.log(`处理文件事件: ${event.type} - ${event.file.path}`);
				this.updateFileDisplay();
			});
			
			this.unsubscribes.push(unsubscribe);
		}
		
		// 订阅Markdown文件事件
		const unsubscribe = this.fileManager.onFileTypeEvents('md', event => {
			if (event.type === FileEventType.RENAME) {
				console.log(`重命名事件: ${event.file.path} (原路径: ${event.oldPath})`);
			}
			this.updateFileDisplay();
		});
		
		this.unsubscribes.push(unsubscribe);
	}
	
	/**
	 * 清理事件订阅
	 */
	private clearEventSubscriptions() {
		this.unsubscribes.forEach(unsubscribe => unsubscribe());
		this.unsubscribes = [];
	}

	onunload() {
		// 性能监控器记录
		this.performanceMonitor.logStats();
		
		// 清理事件订阅
		this.clearEventSubscriptions();
		
		// 清理服务
		this.cleanupServices();
	}
	
	/**
	 * 清理所有服务资源
	 */
	private cleanupServices(): void {
		// 清理文件管理器
		if (this.fileManager) {
			this.fileManager.destroy();
		}
		
		// 关闭数据库连接
		RegexCache.getInstance().clear();
		
		// 移除所有DOM修改
		if (this.decorationManager) {
			this.decorationManager.clearFileDecorations();
			this.decorationManager.destroy();
		}
		
		// 清理DOM观察器
		if (this.domObserver) {
			this.domObserver.disconnect();
		}
		
		// 清理统一DOM观察系统
		if (this.unifiedObserver) {
			this.unifiedObserver.destroy();
			window.activeUnifiedObserver = null;
		}
	}

	// 获取更新后的文件名
	public getUpdatedFileName(originalName: string): string | null {
		return this.decorationManager.getUpdatedFileName(originalName);
	}

	// 更新文件显示
	async updateFileDisplay() {
		this.performanceMonitor.startMeasure();
		
		try {
			if (!this.settings.enablePlugin) {
				this.decorationManager.clearFileDecorations();
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
			this.decorationManager.updateConfig({
				fileNamePattern: this.settings.fileNamePattern,
				captureGroup: this.settings.captureGroup,
				showOriginalNameOnHover: this.settings.showOriginalNameOnHover
			});

			// 获取文件夹下所有文件
			const files = this.fileManager.getFiles(folder);
			if (!files || files.length === 0) {
				return;
			}

			// 应用文件装饰
			this.decorationManager.applyFileDecorations(files);
			
			// 刷新编辑器装饰
			this.refreshEditorDecorations();
		} catch (error) {
			console.error('更新文件显示时出错:', error);
		} finally {
			this.performanceMonitor.endMeasure();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// 更新正则缓存设置
		RegexCache.getInstance().updateSettings();
		
		// 更新装饰管理器配置
		this.decorationManager.updateConfig({
			fileNamePattern: this.settings.fileNamePattern,
			captureGroup: this.settings.captureGroup,
			showOriginalNameOnHover: this.settings.showOriginalNameOnHover
		});
		
		// 文件夹变化时，重新初始化文件管理器
		if (this.fileManager && this.settings.activeFolder) {
			// 由于没有updateConfig，创建一个新实例
			this.fileManager = new FileManager(
				this.app,
				{
					activeFolder: this.settings.activeFolder
				}
			);
			
			// 重新设置事件订阅
			this.setupEventSubscriptions();
		}
		
		// 更新文件显示
		await this.updateFileDisplay();
	}

	/**
	 * 打开指定文件名的文件
	 * @param fileName 文件名（不含扩展名）
	 */
	private async openFileByName(fileName: string) {
		try {
			await this.fileManager.openFileByName(fileName);
		} catch (error) {
			console.error('打开文件失败:', error);
			new Notice(`无法打开文件: ${fileName}`);
		}
	}

	/**
	 * 刷新编辑器装饰
	 */
	public refreshEditorDecorations() {
		this.app.workspace.updateOptions();
	}
}

