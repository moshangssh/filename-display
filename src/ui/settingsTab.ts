/**
 * 设置选项卡模块
 * 用于管理插件设置界面
 */
import { App, Notice, PluginSettingTab, Setting, TFolder, normalizePath } from 'obsidian';
import { FileDisplayPluginSettings } from '../types';
import type FileDisplayPlugin from '../../main';
import { RegexCache } from '../utils/regexCache';

export class FileNameDisplaySettingTab extends PluginSettingTab {
    plugin: FileDisplayPlugin;
    private regexTestElement: HTMLElement | null = null;

    constructor(app: App, plugin: FileDisplayPlugin) {
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

        // 文件名匹配模式设置
        const regexSetting = new Setting(containerEl)
            .setName('文件名匹配模式')
            .setDesc('输入正则表达式来匹配文件名。使用捕获组()来指定要提取的部分。')
            .addText(text => text
                .setPlaceholder('^(.+?)_\\d{4}_\\d{2}_\\d{2}_(.+)$')
                .setValue(this.plugin.settings.fileNamePattern)
                .onChange(async (value) => {
                    const regexCache = RegexCache.getInstance();
                    
                    // 验证正则表达式
                    if (!regexCache.isValidRegex(value)) {
                        this.showRegexTestResult(false, '无效的正则表达式');
                        return;
                    }
                    
                    try {
                        // 测试是否包含至少一个捕获组
                        const regex = regexCache.get(value);
                        const testStr = "test_2024_01_01_title";
                        const testMatch = testStr.match(regex);
                        
                        if (!testMatch) {
                            this.showRegexTestResult(false, '无法匹配测试字符串');
                            return;
                        }
                        
                        if (testMatch.length <= this.plugin.settings.captureGroup) {
                            this.showRegexTestResult(false, `正则表达式缺少捕获组 ${this.plugin.settings.captureGroup}`);
                            return;
                        }
                        
                        // 显示匹配结果
                        const capturedText = testMatch[this.plugin.settings.captureGroup] || '无内容';
                        this.showRegexTestResult(true, `捕获组 ${this.plugin.settings.captureGroup} 匹配: "${capturedText}"`);
                        
                        // 更新设置
                        this.plugin.settings.fileNamePattern = value;
                        await this.plugin.saveSettings();
                        // 刷新文件显示
                        this.plugin.updateFileDisplay();
                    } catch (error) {
                        console.error('处理正则表达式时出错:', error);
                        this.showRegexTestResult(false, '处理正则表达式时出错');
                    }
                }));

        // 创建正则测试结果显示容器
        this.regexTestElement = containerEl.createDiv({ cls: 'regex-test-result' });
        this.regexTestElement.style.marginBottom = '1em';
        this.testCurrentRegex();

        new Setting(containerEl)
            .setName('捕获组索引')
            .setDesc('指定要显示的正则表达式捕获组索引 (0 表示完整匹配，1 表示第一个括号内容，依此类推)')
            .addSlider(slider => slider
                .setLimits(0, 9, 1)
                .setValue(this.plugin.settings.captureGroup)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.captureGroup = value;
                    await this.plugin.saveSettings();
                    this.testCurrentRegex();
                    // 刷新文件显示
                    this.plugin.updateFileDisplay();
                }));

        new Setting(containerEl)
            .setName('悬停时显示原始文件名')
            .setDesc('当鼠标悬停在修改后的文件名上时，是否显示原始文件名')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showOriginalNameOnHover)
                .onChange(async (value) => {
                    this.plugin.settings.showOriginalNameOnHover = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateFileDisplay();
                }));

        // 添加自定义样式
        this.addCustomStyles();
    }

    /**
     * 显示正则表达式测试结果
     */
    private showRegexTestResult(isValid: boolean, message: string): void {
        if (!this.regexTestElement) return;
        
        this.regexTestElement.empty();
        
        const statusClass = isValid ? 'regex-valid' : 'regex-invalid';
        const statusIcon = isValid ? '✓' : '✗';
        
        const container = this.regexTestElement.createDiv({ cls: `regex-result ${statusClass}` });
        container.createSpan({ cls: 'regex-status-icon', text: statusIcon });
        container.createSpan({ text: ' ' + message });
    }
    
    /**
     * 测试当前配置的正则表达式
     */
    private testCurrentRegex(): void {
        try {
            const regexCache = RegexCache.getInstance();
            const pattern = this.plugin.settings.fileNamePattern;
            const captureGroup = this.plugin.settings.captureGroup;
            
            // 验证正则表达式是否有效
            if (!regexCache.isValidRegex(pattern)) {
                this.showRegexTestResult(false, '无效的正则表达式');
                return;
            }
            
            // 测试是否可以匹配示例
            const regex = regexCache.get(pattern);
            const testStr = "test_2024_01_01_title";
            const match = testStr.match(regex);
            
            if (!match) {
                this.showRegexTestResult(false, '无法匹配测试字符串');
                return;
            }
            
            if (match.length <= captureGroup) {
                this.showRegexTestResult(false, `正则表达式缺少捕获组 ${captureGroup}`);
                return;
            }
            
            const capturedText = match[captureGroup] || '无内容';
            this.showRegexTestResult(true, `捕获组 ${captureGroup} 匹配: "${capturedText}"`);
        } catch (error) {
            console.error('测试正则表达式时出错:', error);
            this.showRegexTestResult(false, '测试正则表达式时出错');
        }
    }
    
    /**
     * 添加自定义样式
     */
    private addCustomStyles(): void {
        // 添加自定义CSS
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            .regex-result {
                padding: 8px 12px;
                border-radius: 4px;
                margin-top: 8px;
                font-size: 0.9em;
                display: flex;
                align-items: center;
            }
            .regex-valid {
                background-color: rgba(0, 128, 0, 0.1);
                color: var(--text-success);
                border: 1px solid rgba(0, 128, 0, 0.2);
            }
            .regex-invalid {
                background-color: rgba(255, 0, 0, 0.1);
                color: var(--text-error);
                border: 1px solid rgba(255, 0, 0, 0.2);
            }
            .regex-status-icon {
                margin-right: 6px;
                font-weight: bold;
            }
        `;
        document.head.appendChild(styleElement);
        
        // 确保在隐藏设置面板时移除样式
        this.plugin.register(() => styleElement.remove());
    }
}  
