/**
 * 统一导出编辑器扩展
 */

export { viewportExtension } from './viewport';
export { incrementalUpdateExtension } from './incremental-update';
export { editorSyncExtension } from './editor-sync';

// 从 editor.ts 导出关键扩展和类型
export { 
  LinkReplaceWidget,
  createLinkDecorationExtension,
  createLinkObserverExtension,
  createEditorExtensions,
  addLinkDecoration,
  removeLinkDecoration,
  updateTextEffect,
  updateLinkDisplayName,
  updateWidgetText,
  EditorErrorHandler,
  EditorErrorType,
  hasStateField
} from './editor'; 