import { FileDisplayPluginSettings } from '../types';

/**
 * 处理Markdown视图中的链接
 * @param el HTML元素，包含渲染后的Markdown内容
 * @param settings 插件设置
 * @param getUpdatedFileName 获取更新后文件名的函数
 */
export function processMarkdownLinks(
  el: HTMLElement, 
  settings: FileDisplayPluginSettings,
  getUpdatedFileName: (name: string) => string | null
) {
  if (!settings.enablePlugin) return;

  try {
    const links = Array.from(el.querySelectorAll('a.internal-link'));
    for (const link of links) {
      try {
        const originalName = link.getAttribute('data-href');
        if (!originalName) continue;

        const newName = getUpdatedFileName(originalName);
        if (newName) {
          // 设置显示文本
          link.textContent = newName;
          
          // 添加原始名称的提示
          if (settings.showOriginalNameOnHover) {
            link.setAttribute('title', originalName);
          }
          
          // 为链接添加一个特殊的类，以便于CSS样式定位
          link.classList.add('decorated-link');
        }
      } catch (error) {
        console.error(`处理链接失败: ${link.getAttribute('data-href')}`, error);
        // 继续处理其他链接
      }
    }
  } catch (error) {
    console.error('处理Markdown链接失败:', error);
  }
}  
