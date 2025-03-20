import { MarkdownView, editorViewField, Editor } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { LoggerService } from '../services/LoggerService';

const logger = new LoggerService('EditorUtils');

/**
 * 从 MarkdownView 获取 EditorView 实例的标准方法
 * 使用更安全的方式获取CodeMirror编辑器实例
 */
export function getEditorView(view: MarkdownView): EditorView | null {
  try {
    if (!view || !view.editor) {
      return null;
    }

    // 获取编辑器
    const editor = view.editor;
    let editorView: EditorView | null = null;
    
    // 尝试使用标准方式获取 - 通过插件API
    try {
      // @ts-ignore - 使用Obsidian内部API但添加注释解释原因
      // 我们使用内部API是因为没有公开的方式来获取EditorView
      // 在不同版本的Obsidian中，editorViewField可能存在于不同位置
      editorView = editor.cm;
    } catch (e) {
      logger.debug('无法通过editor.cm直接获取编辑器视图');
    }
    
    // 如果直接获取失败，尝试使用状态字段
    if (!editorView) {
      try {
        // @ts-ignore - 访问内部状态字段
        const state = editor.cm?.state;
        if (state && editorViewField) {
          editorView = state.field(editorViewField);
        }
      } catch (e) {
        logger.debug('无法通过状态字段获取编辑器视图');
      }
    }
    
    return editorView;
  } catch (error) {
    logger.error('获取编辑器视图时出错：', error);
    return null;
  }
}

/**
 * 从编辑器获取当前文档内容
 * 通过Obsidian标准API实现，避免直接使用CodeMirror
 */
export function getDocumentText(editor: Editor): string {
  return editor.getValue();
}

/**
 * 检查编辑器是否在编辑模式（而非预览模式）
 */
export function isEditorInEditMode(view: MarkdownView): boolean {
  return view.getMode() === 'source';
}

/**
 * 安全地执行编辑器操作
 * 包装可能的错误处理
 */
export function safelyExecuteEditorOperation<T>(
  operation: () => T, 
  fallback: T, 
  errorMessage: string = '执行编辑器操作时出错'
): T {
  try {
    return operation();
  } catch (error) {
    logger.error(`${errorMessage}:`, error);
    return fallback;
  }
} 