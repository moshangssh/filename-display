/**
 * CSS生成器模块
 * 用于创建和管理文件名显示的CSS规则
 */
import { TFile } from 'obsidian';

/**
 * 为文件生成CSS规则，用于替换显示名称
 * 
 * @param file 文件对象
 * @param newName 新的显示名称
 * @returns 生成的CSS规则字符串
 */
export function generateCssRule(file: TFile, newName: string): string {
    const escapedPath = CSS.escape(file.path);
    const escapedName = CSS.escape(newName);
    
    return `
        [data-path="${escapedPath}"] {
            --display-name: "${escapedName}";
        }
    `;
}

/**
 * 生成基础CSS规则
 * 只需在插件初始化时添加一次
 */
export function generateBaseCssRules(): string {
    return `
        /* 通用样式 */
        [data-path] .nav-file-title-content,
        [data-path] .workspace-tab-header-inner-title,
        [data-path] .view-header-title,
        [data-path] .tree-item-inner {
            color: transparent;
            position: relative;
        }

        /* 使用CSS变量实现内容替换 */
        [data-path] .nav-file-title-content::before,
        [data-path] .workspace-tab-header-inner-title::before,
        [data-path] .view-header-title::before,
        [data-path] .tree-item-inner::before {
            content: var(--display-name);
            position: absolute;
            left: 0;
            color: var(--text-normal);
            /* 添加GPU加速 */
            transform: translateZ(0);
            will-change: transform;
        }
    `;
}

/**
 * 创建或更新样式元素
 * 
 * @param styleEl 样式元素引用
 * @param cssRules CSS规则集合
 * @returns 更新后的样式元素
 */
export function updateStyleElement(
    styleEl: HTMLStyleElement | null, 
    cssRules: Map<string, string>
): HTMLStyleElement {
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.textContent = generateBaseCssRules();
        document.head.appendChild(styleEl);
    }
    
    const cssContent = Array.from(cssRules.values()).join('\n');
    styleEl.textContent = generateBaseCssRules() + cssContent;
    
    return styleEl;
}  
