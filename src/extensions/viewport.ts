import { Extension } from '@codemirror/state';
import { ViewPlugin, ViewUpdate, EditorView, PluginValue } from '@codemirror/view';
import { Logger } from '../utils/logger';

const logger = new Logger('Viewport');

interface ViewportState {
  visible: boolean;
  from: number;
  to: number;
}

/**
 * 视口状态管理插件
 * 跟踪编辑器视口变化，并支持事件委托
 */
class ViewportTracker implements PluginValue {
  private currentState: ViewportState;
  private callbacks: ((state: ViewportState) => void)[] = [];

  constructor(view: EditorView) {
    // 初始化视口状态
    const viewport = view.viewport;
    this.currentState = {
      visible: true,
      from: viewport.from,
      to: viewport.to
    };

    // 在初始化时记录初始视口
    if (logger.isDebugEnabled()) {
      logger.debug('初始视口状态:', this.currentState);
    }
  }

  update(update: ViewUpdate) {
    // 仅在视口变化时更新
    if (!update.viewportChanged) return;

    const viewport = update.view.viewport;
    const newState: ViewportState = {
      visible: true,
      from: viewport.from,
      to: viewport.to
    };

    // 检测视口变化，避免冗余记录
    const hasChanged = this.currentState.from !== newState.from || 
                       this.currentState.to !== newState.to;

    if (hasChanged) {
      // 更新当前状态
      this.currentState = newState;

      // 仅在调试模式下记录视口变化
      if (logger.isDebugEnabled()) {
        logger.debug('视口变化:', newState);
      }

      // 触发所有注册的回调
      this.notifyCallbacks();
    }
  }

  // 注册视口变化回调，返回取消注册的函数
  onViewportChange(callback: (state: ViewportState) => void): () => void {
    this.callbacks.push(callback);
    
    // 返回取消注册的函数
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index >= 0) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  // 获取当前视口状态
  getViewportState(): ViewportState {
    return { ...this.currentState };
  }

  // 通知所有回调
  private notifyCallbacks() {
    // 创建状态副本，避免回调修改状态
    const stateCopy = { ...this.currentState };
    
    // 通知所有回调
    for (const callback of this.callbacks) {
      try {
        callback(stateCopy);
      } catch (error) {
        logger.error('视口变化回调执行错误:', error);
      }
    }
  }

  destroy() {
    // 清空所有回调
    this.callbacks = [];
    if (logger.isDebugEnabled()) {
      logger.debug('视口追踪器已销毁');
    }
  }
}

/**
 * 创建视口追踪扩展
 * 遵循CodeMirror的函数式编程模型
 */
export const viewportExtension = (): Extension => {
  return ViewPlugin.define((view) => new ViewportTracker(view));
}; 