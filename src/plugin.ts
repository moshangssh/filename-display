import { App, Editor, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { FilenameDisplaySettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { FilenameDisplaySettingTab } from './settings/SettingsTab';
import { FileDisplayService } from './services';

export default class FilenameDisplayPlugin extends Plugin {
    settings: FilenameDisplaySettings;
    private fileDisplayService: FileDisplayService;

    async onload() {
        await this.loadSettings();
        // 创建文件显示服务
        this.fileDisplayService = new FileDisplayService(this);

        // 添加设置标签页
        this.addSettingTab(new FilenameDisplaySettingTab(this.app, this));

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