import { Extension } from '@codemirror/state';
import { ViewPlugin, ViewUpdate, EditorView, PluginValue } from '@codemirror/view';
import { Logger } from '../utils/logger';
import type { ITitleExtractorPlugin } from '../types';

const logger = new Logger('EditorSync');

// 实现PluginValue接口，处理更新生命周期
class EditorSyncPlugin implements PluginValue {
  private pendingUpdate: boolean = false;
  private lastUpdateTime: number = 0;
  private readonly plugin: ITitleExtractorPlugin;
  private readonly UPDATE_INTERVAL = 100; // 最小更新间隔（毫秒）

  constructor(view: EditorView, plugin: ITitleExtractorPlugin) {
    this.plugin = plugin;
    
    // 设置事件监听 - 仅在插件实例化时执行一次
    this.plugin.app.workspace.on('active-leaf-change', () => {
      this.scheduleUpdate(view);
    });
  }

  update(update: ViewUpdate) {
    // 当编辑器内容变化时触发同步
    if (update.docChanged) {
      this.scheduleUpdate(update.view);
    }
  }

  // 用于释放资源的destroy方法
  destroy() {
    // 清理可能的资源
    if (logger.isDebugEnabled()) {
      logger.debug('编辑器同步插件已销毁');
    }
  }

  // 安排更新
  private scheduleUpdate(view: EditorView): void {
    if (this.pendingUpdate) return;
    
    this.pendingUpdate = true;
    const now = Date.now();
    
    if (now - this.lastUpdateTime < this.UPDATE_INTERVAL) {
      // 如果距离上次更新太近，使用 requestIdleCallback 延迟执行
      requestIdleCallback(() => {
        this.performUpdate(view);
      }, { timeout: this.UPDATE_INTERVAL });
    } else {
      // 直接执行更新
      this.performUpdate(view);
    }
  }

  // 执行更新
  private performUpdate(view: EditorView): void {
    if (!this.pendingUpdate) return;
    
    try {
      // 获取当前活动叶子节点
      const activeLeaf = this.plugin.app.workspace.activeLeaf;
      if (!activeLeaf) {
        if (logger.isDebugEnabled()) {
          logger.debug('无活动叶子节点，跳过编辑器同步');
        }
        return;
      }

      // 获取当前视图
      const viewState = activeLeaf.getViewState();
      if (!viewState) {
        if (logger.isDebugEnabled()) {
          logger.debug('无法获取视图状态，跳过编辑器同步');
        }
        return;
      }

      // 记录更新 - 仅在需要调试时
      if (logger.isDebugEnabled()) {
        logger.debug('编辑器状态同步:', {
          viewState: viewState.type,
          timestamp: Date.now()
        });
      }

      // 更新最后更新时间
      this.lastUpdateTime = Date.now();
    } catch (error) {
      // 错误情况始终记录
      logger.error('编辑器状态同步失败:', error);
    } finally {
      // 重置状态
      this.pendingUpdate = false;
    }
  }
}

export const editorSyncExtension = (plugin: ITitleExtractorPlugin): Extension => {
  return ViewPlugin.define(
    (view) => new EditorSyncPlugin(view, plugin)
  );
}; 