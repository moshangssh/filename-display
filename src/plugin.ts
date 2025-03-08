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
        console.log('卸载Filename Display插件...');
        
        try {
            // 恢复所有原始显示名称
            this.fileDisplayService.restoreAllDisplayNames();
            
            // 获取缓存实例并停止定期清理
            const cache = this.fileDisplayService.getCache();
            if (cache) {
                cache.stopPeriodicCleanup();
            }
            
            // 清理所有事件监听器和观察器
            if (this.fileDisplayService) {
                this.fileDisplayService.dispose();
            }
            
            console.log('Filename Display插件已成功卸载并清理所有资源');
        } catch (error) {
            console.error('卸载Filename Display插件时出错:', error);
        }
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