import { MarkdownView, editorViewField } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Logger } from './logger';

const logger = new Logger('EditorUtils');

/**
 * 从 MarkdownView 获取 EditorView 实例的标准方法
 * 这是获取 CodeMirror EditorView 的规范方式
 */
export function getEditorView(view: MarkdownView): EditorView | null {
  try {
    // 使用安全的方式获取编辑器视图
    const editor = view.editor;
    
    // 使用类型断言访问内部属性，因为这些属性在 Obsidian 的公共 API 中未定义
    // 但这是目前获取 EditorView 的推荐方式
    const editorView = (editor as any).cm instanceof EditorView
      ? (editor as any).cm
      : (editor as any).cm?.state?.field?.(editorViewField) || null;
    
    return editorView;
  } catch (error) {
    logger.error('获取编辑器视图时出错：', error);
    return null;
  }
}

/**
 * 检查编辑器是否在编辑模式（而非预览模式）
 */
export function isEditorInEditMode(view: MarkdownView): boolean {
  return view.getMode() === 'source';
} 