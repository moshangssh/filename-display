/**
 * Widget 样式模块
 * 统一管理所有与 Widget 相关的样式
 */
import { EditorView } from '@codemirror/view';

/**
 * 链接部件和文件名装饰部件相关的 CSS 样式
 */
export const widgetStyles = EditorView.baseTheme({
    // 增强型链接部件样式
    '.enhanced-link-widget': {
        position: 'relative',
        display: 'inline-block'
    },
    '.link-display': {
        color: 'var(--text-accent)',
        textDecoration: 'none',
        cursor: 'pointer'
    },
    '.link-tooltip': {
        display: 'none',
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '4px 8px',
        backgroundColor: 'var(--background-modifier-hover)',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: '100'
    },
    '.enhanced-link-widget:hover .link-tooltip': {
        display: 'block'
    },
    
    // 文件名装饰部件样式
    '.filename-decoration-widget': {
        position: 'relative',
        display: 'inline-block'
    },
    '.filename-display': {
        color: 'var(--text-accent)',
        textDecoration: 'none',
        cursor: 'pointer'
    },
    '.filename-tooltip': {
        display: 'none',
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '4px 8px',
        backgroundColor: 'var(--background-modifier-hover)',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: '100'
    },
    '.filename-decoration-widget:hover .filename-tooltip': {
        display: 'block'
    }
});

/**
 * 创建全局样式元素
 * 用于处理文件名显示在文件浏览器和标题栏中
 */
export function createGlobalStyles(): HTMLStyleElement {
    const styleEl = document.createElement('style');
    styleEl.id = 'filename-display-global-styles';
    
    // 添加全局基础样式
    styleEl.textContent = `
        /* 基础样式，使原始文件名变为透明 */
        .nav-file-title-content[data-displayed-filename],
        .workspace-tab-header-inner-title[data-displayed-filename],
        .view-header-title[data-displayed-filename] {
            color: transparent !important;
            position: relative;
        }
        
        /* 伪元素内容定位，精确显示在原始文件名位置 */
        .nav-file-title-content[data-displayed-filename]::before,
        .workspace-tab-header-inner-title[data-displayed-filename]::before,
        .view-header-title[data-displayed-filename]::before {
            content: attr(data-displayed-filename);
            position: absolute;
            left: 0;
            top: 0;
            right: 0;
            bottom: 0;
            color: var(--text-normal);
            background: none;
            z-index: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: flex;
            align-items: center;
        }
        
        /* 确保图标和展开/折叠箭头保持可见 */
        .nav-folder-collapse-indicator, 
        .nav-file-icon {
            z-index: 2;
            position: relative;
        }
    `;
    
    return styleEl;
} 