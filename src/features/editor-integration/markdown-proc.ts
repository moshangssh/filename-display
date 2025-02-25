import { MarkdownPostProcessor } from 'obsidian';
import { FileProcessor } from '../../types/interfaces';

export class MarkdownProcessor {
    constructor(private fileProcessor: FileProcessor) {}

    createPostProcessor(): MarkdownPostProcessor {
        return (el: HTMLElement) => {
            const links = Array.from(el.querySelectorAll('a.internal-link'));
            
            for (const link of links) {
                try {
                    const originalName = link.getAttribute('data-href');
                    if (!originalName) continue;

                    const newName = this.fileProcessor.getUpdatedFileName(originalName);
                    if (newName) {
                        link.textContent = newName;
                    }
                } catch (error) {
                    console.error(`处理链接失败: ${link.getAttribute('data-href')}`, error);
                }
            }
        };
    }
}
