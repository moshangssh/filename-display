import { Plugin, App, TFolder, Notice, TFile } from 'obsidian';
import { MyPluginSettings } from '../types/interfaces';
import { DefaultCacheManager } from './cache-manager';
import { EventHandler } from './event-handler';
import { DefaultStyleManager } from '../services/style-manager';
import { FileProcessorManager } from '../features/file-processor';
import { CodeMirrorExtension } from '../features/editor-integration/code-mirror-ext';
import { MarkdownProcessor } from '../features/editor-integration/markdown-proc';
import { ValidationHelper } from '../utils/validation';
import { PathHelper } from '../utils/path-helper';
import { FileNameDisplaySettingTab } from '../features/ui-components/setting-tab';
import { FileCrawler } from '../features/file-processor/file-crawler';
import { FileProcessorFactory } from '../features/file-processor/file-processor-factory';
import { FileProcessor, StyleManager } from '../types/interfaces';

export const DEFAULT_SETTINGS: MyPluginSettings = {
    activeFolder: '',
    enablePlugin: true,
    fileNamePattern: '^(.+?)_\\d{4}_\\d{2}_\\d{2}_(.+)$',
    captureGroup: 2,
    maxCacheSize: 100,
    batchSize: 1000,
    showOriginalNameOnHover: true
};

export class FileNameDisplayPlugin extends Plugin {
    constructor(
        app: App,
        private parentPlugin: Plugin
    ) {
        super(app, parentPlugin.manifest);
    }

    settings: MyPluginSettings;
    private cacheManager: DefaultCacheManager;
    private styleManager: StyleManager;
    private fileProcessor: FileProcessor;
    private eventHandler: EventHandler;
    private codeMirrorExt: CodeMirrorExtension;
    private markdownProc: MarkdownProcessor;
    private fileCrawler: FileCrawler;

    async onload() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.initializeComponents();
        this.registerComponents();
        await this.updateFileDisplay();
    }

    async saveSettings() {
        await this.saveData(this.settings);
        await this.updateFileDisplay();
    }

    private initializeComponents(): void {
        this.cacheManager = new DefaultCacheManager();
        this.fileProcessor = FileProcessorFactory.createProcessor(this.settings);
        this.styleManager = new DefaultStyleManager(this.fileProcessor);
        this.eventHandler = new EventHandler(this, this.settings, () => this.updateFileDisplay());
        this.codeMirrorExt = new CodeMirrorExtension(this.settings, name => this.fileProcessor.getUpdatedFileName(name));
        this.markdownProc = new MarkdownProcessor(this.fileProcessor);
        this.fileCrawler = new FileCrawler(this.settings);
    }

    private registerComponents(): void {
        this.addSettingTab(new FileNameDisplaySettingTab(this.app, this));
        this.registerEditorExtension(this.codeMirrorExt.createExtension());
        this.registerMarkdownPostProcessor(this.markdownProc.createPostProcessor());
    }

    async updateFileDisplay(): Promise<void> {
        try {
            if (!this.settings.enablePlugin) {
                this.styleManager.clearStyles();
                return;
            }

            const folder = this.app.vault.getAbstractFileByPath(
                PathHelper.normalize(this.settings.activeFolder)
            );

            if (!ValidationHelper.isValidFolder(folder)) {
                return;
            }

            const cachedFiles = this.cacheManager.getFromCache(folder.path);
            const files = cachedFiles?.files || await this.getAllFiles(folder);
            
            if (!cachedFiles) {
                this.cacheManager.addToCache(folder.path, files);
            }

            const processedNames = this.fileProcessor.processFiles(files);
            this.styleManager.updateStyles(files);

        } catch (error) {
            console.error('更新文件显示失败:', error);
            new Notice('更新文件显示失败');
        }
    }

    private async getAllFiles(folder: TFolder): Promise<TFile[]> {
        return this.fileCrawler.getAllFiles(folder);
    }

    onunload() {
        this.styleManager?.clearStyles();
        this.eventHandler?.destroy();
    }

    public getOriginalFileName(displayName: string): string | null {
        return this.fileProcessor.findOriginalFileName(displayName);
    }

    // ... 其他必要的方法
}

