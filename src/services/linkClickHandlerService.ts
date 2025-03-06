import { DecorationManager } from './decorationManager';

/**
 * 链接点击处理服务
 * 负责处理文档和编辑器中的链接点击事件
 */
export class LinkClickHandlerService {
    private decorationManager: DecorationManager;
    private openFileCallback: (fileName: string) => Promise<void>;
    
    /**
     * 创建链接点击处理服务
     * @param decorationManager 装饰管理器实例
     * @param openFileCallback 打开文件的回调函数
     */
    constructor(
        decorationManager: DecorationManager,
        openFileCallback: (fileName: string) => Promise<void>
    ) {
        this.decorationManager = decorationManager;
        this.openFileCallback = openFileCallback;
    }
    
    /**
     * 注册点击事件处理
     * @returns 用于注册清理函数的回调
     */
    public register(): () => void {
        // 创建事件处理函数
        const handleClick = this.handleLinkClick.bind(this);
        
        // 添加全局点击事件监听
        document.addEventListener('click', handleClick);
        
        // 返回清理函数
        return () => {
            document.removeEventListener('click', handleClick);
        };
    }
    
    /**
     * 处理链接点击事件
     */
    private handleLinkClick(evt: MouseEvent): void {
        const target = evt.target as HTMLElement;
        
        // 检查是否点击了相关链接元素
        if (!target.matches('.internal-link, .cm-hmd-internal-link, .filename-display')) {
            return;
        }
        
        // 获取原始文本
        const originalText = this.getOriginalText(target);
        if (!originalText) {
            return;
        }
        
        // 查找原始文件名
        const originalName = this.decorationManager.findOriginalFileName(originalText);
        if (originalName) {
            // 阻止默认行为
            evt.preventDefault();
            
            // 打开正确的文件
            this.openFileCallback(originalName);
        }
    }
    
    /**
     * 从元素中获取原始文本
     */
    private getOriginalText(element: HTMLElement): string {
        // 首先尝试从dataset获取
        if (element.dataset.originalText) {
            return element.dataset.originalText;
        } 
        
        // 尝试从父元素获取
        if (element.parentElement?.dataset.originalText) {
            return element.parentElement.dataset.originalText;
        }
        
        // 最后尝试使用文本内容
        return element.textContent || '';
    }
} 