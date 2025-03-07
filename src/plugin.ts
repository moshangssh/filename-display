import { App, Editor, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { FilenameDisplaySettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { SampleModal } from './modals/SampleModal';
import { FilenameDisplaySettingTab } from './settings/SettingsTab';
import { FileDisplayService } from './services/FileDisplayService';

export default class FilenameDisplayPlugin extends Plugin {
    settings: FilenameDisplaySettings;
    private fileDisplayService: FileDisplayService;

    async onload() {
        await this.loadSettings();
        this.fileDisplayService = new FileDisplayService(this);

        // 添加图标到左侧栏
        const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
            new Notice('This is a notice!');
        });
        ribbonIconEl.addClass('my-plugin-ribbon-class');

        // 添加状态栏项目
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText('Status Bar Text');

        // 添加简单命令
        this.addCommand({
            id: 'open-sample-modal-simple',
            name: 'Open sample modal (simple)',
            callback: () => {
                new SampleModal(this.app).open();
            }
        });

        // 添加编辑器命令
        this.addCommand({
            id: 'sample-editor-command',
            name: 'Sample editor command',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                console.log(editor.getSelection());
                editor.replaceSelection('Sample Editor Command');
            }
        });

        // 添加复杂命令
        this.addCommand({
            id: 'open-sample-modal-complex',
            name: 'Open sample modal (complex)',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) {
                        new SampleModal(this.app).open();
                    }
                    return true;
                }
            }
        });

        // 添加设置标签页
        this.addSettingTab(new FilenameDisplaySettingTab(this.app, this));

        // 注册 DOM 事件
        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
            console.log('click', evt);
        });

        // 注册定时器
        this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

        // 监听文件创建事件
        this.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile) {
                    this.fileDisplayService.updateFileExplorerDisplay(file);
                }
            })
        );

        // 监听文件重命名事件
        this.registerEvent(
            this.app.vault.on('rename', (file) => {
                if (file instanceof TFile) {
                    this.fileDisplayService.updateFileExplorerDisplay(file);
                }
            })
        );

        // 监听布局变更事件
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                // 重新设置观察器并更新所有文件显示
                this.fileDisplayService.resetObservers();
                this.fileDisplayService.updateAllFilesDisplay();
            })
        );

        // 初始化所有文件的显示
        this.fileDisplayService.updateAllFilesDisplay();
    }

    onunload() {
        // 恢复所有显示名称并清理资源
        this.fileDisplayService.restoreAllDisplayNames();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    updateAllFilesDisplay(): void {
        this.fileDisplayService.updateAllFilesDisplay();
    }
} 