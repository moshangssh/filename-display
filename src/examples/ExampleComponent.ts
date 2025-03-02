import { App, PluginSettingTab, Setting, Plugin, MarkdownView } from 'obsidian';
import { RxJSExample } from './rxjsDebounceExample';
import { 
    debounceFn, 
    setDebounceImplementation, 
    DebounceImplementation,
    createDebouncedObservable
} from '../utils/debounceIntegration';

/**
 * 示例设置标签页
 * 演示如何在实际组件中使用RxJS防抖
 */
export class ExampleSettingTab extends PluginSettingTab {
    private rxjsExample: RxJSExample;
    private searchInputEl: HTMLInputElement | null = null;
    
    constructor(app: App, private plugin: Plugin) {
        super(app, plugin);
        this.rxjsExample = new RxJSExample(app, plugin);
        
        // 设置使用RxJS实现
        setDebounceImplementation(DebounceImplementation.RXJS);
    }
    
    /**
     * 显示设置
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        
        containerEl.createEl('h2', { text: 'RxJS防抖示例' });
        
        // 初始化RxJS流
        this.rxjsExample.initialize();
        
        // 添加搜索输入框
        new Setting(containerEl)
            .setName('搜索')
            .setDesc('输入关键词进行搜索（带有防抖处理）')
            .addText(text => {
                this.searchInputEl = text.inputEl;
                text.setPlaceholder('输入关键词...');
                
                // 将输入框与RxJS示例关联
                this.rxjsExample.setupDOMListeners(text.inputEl);
                
                return text;
            });
            
        // 添加手动触发高级示例的按钮
        new Setting(containerEl)
            .setName('触发高级示例')
            .setDesc('演示更复杂的RxJS链式操作')
            .addButton(button => 
                button
                    .setButtonText('触发')
                    .onClick(() => {
                        this.rxjsExample.setupAdvancedExample();
                    })
            );
            
        // 添加对比示例
        this.addComparisonExamples(containerEl);
    }
    
    /**
     * 添加不同实现对比示例
     */
    private addComparisonExamples(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '实现对比' });
        
        // 创建三个文本区域来显示结果
        const resultAreaContainer = containerEl.createDiv({ cls: 'comparison-results' });
        resultAreaContainer.style.display = 'flex';
        resultAreaContainer.style.marginBottom = '20px';
        
        // 创建两个结果区域
        const customResultEl = this.createResultArea(resultAreaContainer, '自定义实现');
        const rxjsResultEl = this.createResultArea(resultAreaContainer, 'RxJS实现');
        
        // 输入框
        const inputEl = containerEl.createEl('input', { 
            type: 'text',
            placeholder: '输入内容测试防抖...',
            cls: 'comparison-input'
        });
        
        inputEl.style.width = '100%';
        inputEl.style.marginBottom = '10px';
        
        // 切换到自定义实现
        setDebounceImplementation(DebounceImplementation.CUSTOM);
        
        // 自定义实现的防抖
        const customDebounce = debounceFn((value: string) => {
            customResultEl.textContent = `结果: ${value} (自定义实现)`;
            return value;
        }, 500, false, 'customDebounce');
        
        // 切换到RxJS实现
        setDebounceImplementation(DebounceImplementation.RXJS);
        
        // RxJS实现的防抖
        const rxjsDebounce = debounceFn((value: string) => {
            rxjsResultEl.textContent = `结果: ${value} (RxJS实现)`;
            return value;
        }, 500, false, 'rxjsDebounce');
        
        // 监听输入
        inputEl.addEventListener('input', () => {
            const value = inputEl.value;
            customDebounce(value);
            rxjsDebounce(value);
        });
    }
    
    /**
     * 创建结果显示区域
     */
    private createResultArea(container: HTMLElement, title: string): HTMLElement {
        const areaEl = container.createDiv({ cls: 'result-area' });
        areaEl.style.flex = '1';
        areaEl.style.margin = '0 5px';
        areaEl.style.padding = '10px';
        areaEl.style.border = '1px solid #ddd';
        areaEl.style.borderRadius = '4px';
        
        areaEl.createEl('h4', { text: title });
        const resultEl = areaEl.createDiv({ cls: 'result-content' });
        resultEl.textContent = '等待输入...';
        
        return resultEl;
    }
    
    /**
     * 组件卸载时清理资源
     */
    hide(): void {
        this.rxjsExample.destroy();
    }
}

// 别忘了导入debounce函数
import { debounce } from '../utils/debounce'; 