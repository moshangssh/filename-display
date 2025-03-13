import { Extension } from '@codemirror/state';
import { ViewPlugin, ViewUpdate, EditorView } from '@codemirror/view';
import { Logger } from '../utils/logger';
import type { ITitleExtractorPlugin } from '../types';

const logger = new Logger('EditorSync');

export const editorSyncExtension = (plugin: ITitleExtractorPlugin): Extension => {
  return ViewPlugin.define((view) => {
    // 使用 requestIdleCallback 节流更新
    let pendingUpdate = false;
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 100; // 最小更新间隔（毫秒）

    const scheduleUpdate = () => {
      if (pendingUpdate) return;
      
      pendingUpdate = true;
      const now = Date.now();
      
      if (now - lastUpdateTime < UPDATE_INTERVAL) {
        // 如果距离上次更新太近，使用 requestIdleCallback 延迟执行
        requestIdleCallback(() => {
          performUpdate();
        }, { timeout: UPDATE_INTERVAL });
      } else {
        // 直接执行更新
        performUpdate();
      }
    };

    const performUpdate = () => {
      if (!pendingUpdate) return;
      
      try {
        // 获取当前活动叶子节点
        const activeLeaf = plugin.app.workspace.activeLeaf;
        if (!activeLeaf) return;

        // 获取当前视图
        const viewState = activeLeaf.getViewState();
        if (!viewState) return;

        // 记录更新
        logger.log('编辑器状态同步:', {
          viewState: viewState.type,
          timestamp: Date.now()
        });

        // 更新最后更新时间
        lastUpdateTime = Date.now();
      } catch (error) {
        logger.error('编辑器状态同步失败:', error);
      } finally {
        pendingUpdate = false;
      }
    };

    // 注册事件监听器
    plugin.app.workspace.on('active-leaf-change', () => {
      scheduleUpdate();
    });

    return {
      update(update: ViewUpdate) {
        // 当编辑器内容变化时也触发同步
        if (update.docChanged) {
          scheduleUpdate();
        }
      }
    };
  });
}; 