import { App, PluginSettingTab, Setting, Plugin, MarkdownView } from 'obsidian';
import { RxJSExample } from './rxjsDebounceExample';
import { 
    debounceFn, 
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
            
        // 添加RxJS示例
        this.addRxJSExamples(containerEl);
    }
    
    /**
     * 添加RxJS实现示例
     */
    private addRxJSExamples(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'RxJS防抖示例' });
        
        // 创建结果区域
        const resultAreaContainer = containerEl.createDiv({ cls: 'result-container' });
        resultAreaContainer.style.marginBottom = '20px';
        
        // 创建结果区域
        const resultEl = this.createResultArea(resultAreaContainer, 'RxJS防抖结果');
        
        // 创建Observable版本结果区域
        const observableResultEl = this.createResultArea(resultAreaContainer, 'Observable版本');
        
        // 输入框
        const inputEl = containerEl.createEl('input', { 
            type: 'text',
            placeholder: '输入内容测试防抖...',
            cls: 'comparison-input'
        });
        
        inputEl.style.width = '100%';
        inputEl.style.marginBottom = '10px';
        
        // 函数版本的RxJS防抖实现
        const functionDebounce = debounceFn((value: string) => {
            resultEl.textContent = `结果: ${value} (函数版本)`;
            return value;
        }, 500, false, 'functionDebounce');
        
        // Observable版本的防抖实现
        const { observable, next } = createDebouncedObservable<string>(
            500, false, 'observableDebounce'
        );
        
        // 订阅Observable
        observable.subscribe(value => {
            observableResultEl.textContent = `结果: ${value} (Observable版本)`;
        });
        
        // 监听输入
        inputEl.addEventListener('input', () => {
            const value = inputEl.value;
            functionDebounce(value);  // 函数版本
            next(value);              // Observable版本
        });
    }
    
    /**
     * 创建结果显示区域
     */
    private createResultArea(container: HTMLElement, title: string): HTMLElement {
        const areaEl = container.createDiv({ cls: 'result-area' });
        areaEl.style.margin = '10px 0';
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