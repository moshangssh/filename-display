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
        /* 文件树导航栏 */
        [data-path="${escapedPath}"] .nav-file-title-content {
            color: transparent;
        }
        [data-path="${escapedPath}"] .nav-file-title-content::before {
            content: "${escapedName}";
        }
        
        /* 编辑器标签页标题 */
        .workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title {
            color: transparent;
        }
        .workspace-tab-header[data-path="${escapedPath}"] .workspace-tab-header-inner-title::before {
            content: "${escapedName}";
        }
        
        /* 文件标题栏 */
        .view-header[data-path="${escapedPath}"] .view-header-title {
            color: transparent;
        }
        .view-header[data-path="${escapedPath}"] .view-header-title::before {
            content: "${escapedName}";
        }
        
        /* 搜索结果和其他位置 */
        .tree-item[data-path="${escapedPath}"] .tree-item-inner {
            color: transparent;
        }
        .tree-item[data-path="${escapedPath}"] .tree-item-inner::before {
            content: "${escapedName}";
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
        document.head.appendChild(styleEl);
    }
    
    const cssContent = Array.from(cssRules.values()).join('\n');
    styleEl.textContent = cssContent;
    
    return styleEl;
}  
