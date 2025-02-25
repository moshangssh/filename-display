import { MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import { FileNameDisplayPlugin } from '../../core/plugin';

export class CodeBlockProcessor {
    constructor(private plugin: FileNameDisplayPlugin) {
        this.registerProcessor();
    }

    private registerProcessor(): void {
        this.plugin.registerMarkdownCodeBlockProcessor('filename-display', (source, el, ctx) => {
            this.render(source, el, ctx);
        });
    }

    private render(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
        const container = el.createDiv({ cls: 'filename-display-container' });
        
        try {
            const lines = source.trim().split('\n');
            
            // 创建表格显示文件名映射
            const table = container.createEl('table', { cls: 'filename-display-table' });
            const thead = table.createEl('thead');
            const headerRow = thead.createEl('tr');
            headerRow.createEl('th', { text: '原始文件名' });
            headerRow.createEl('th', { text: '显示名称' });
            
            const tbody = table.createEl('tbody');
            
            // 处理每一行
            for (const line of lines) {
                if (!line.trim()) continue;
                
                const row = tbody.createEl('tr');
                const originalName = line.trim();
                const displayName = this.plugin.getUpdatedFileName(originalName) || originalName;
                
                row.createEl('td', { text: originalName });
                row.createEl('td', { text: displayName });
            }
            
            // 添加说明
            container.createEl('p', { 
                cls: 'filename-display-info',
                text: '此表格显示了根据当前设置的文件名转换规则。' 
            });
            
        } catch (error) {
            container.createEl('div', { 
                cls: 'filename-display-error',
                text: `处理失败: ${error.message}` 
            });
        }
        
        // 添加到上下文以便正确清理
        ctx.addChild(new MarkdownRenderChild(container));
    }
} 