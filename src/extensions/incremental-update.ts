import { Extension } from '@codemirror/state';
import { ViewPlugin, ViewUpdate, EditorView, PluginValue } from '@codemirror/view';
import { LoggerService } from "../services/LoggerService";

const logger = new LoggerService('IncrementalUpdate');

interface ChangeRange {
  from: number;
  to: number;
  type: 'add' | 'remove' | 'update';
}

/**
 * 文档增量更新插件
 * 追踪并处理文档内容变化
 */
class IncrementalUpdateTracker implements PluginValue {
  private callbacks: ((ranges: ChangeRange[]) => void)[] = [];
  private changeCount: number = 0;
  private readonly MAX_LOG_COUNT = 50; // 防止过多日志

  constructor(view: EditorView) {
    // 初始化，无需特殊处理
  }

  update(update: ViewUpdate) {
    if (!update.docChanged) return;
    
    // 仅在有回调或需要调试时收集更改
    if (this.callbacks.length > 0 || logger.isDebugEnabled()) {
      const changes = update.changes;
      const ranges: ChangeRange[] = [];
      
      // 遍历所有变更
      changes.iterChangedRanges((from, to, fromLen, toLen) => {
        // 根据变更类型分类
        if (fromLen === 0) {
          ranges.push({ from, to, type: 'add' });
        } else if (toLen === 0) {
          ranges.push({ from, to: from + fromLen, type: 'remove' });
        } else {
          ranges.push({ from, to, type: 'update' });
        }
      });
      
      // 记录日志 - 限制频率，避免过多日志
      if (logger.isDebugEnabled() && this.changeCount < this.MAX_LOG_COUNT) {
        logger.debug('增量更新范围:', ranges);
        this.changeCount++;
        
        // 周期性重置计数器
        if (this.changeCount >= this.MAX_LOG_COUNT) {
          logger.warn(`已达到最大日志记录次数(${this.MAX_LOG_COUNT})，暂停记录增量更新`);
          // 1分钟后重置计数器
          setTimeout(() => {
            this.changeCount = 0;
            logger.debug('增量更新日志记录已恢复');
          }, 60000);
        }
      }
      
      // 通知回调
      if (ranges.length > 0 && this.callbacks.length > 0) {
        this.notifyCallbacks(ranges);
      }
    }
  }
  
  /**
   * 注册变更回调
   * @param callback 当文档变更时调用的回调函数
   * @returns 取消注册的函数
   */
  onDocumentChange(callback: (ranges: ChangeRange[]) => void): () => void {
    this.callbacks.push(callback);
    
    // 返回用于取消注册的函数
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index >= 0) {
        this.callbacks.splice(index, 1);
      }
    };
  }
  
  /**
   * 通知所有注册的回调
   */
  private notifyCallbacks(ranges: ChangeRange[]): void {
    // 创建副本，避免回调修改数据
    const rangesCopy = [...ranges];
    
    // 调用所有回调
    for (const callback of this.callbacks) {
      try {
        callback(rangesCopy);
      } catch (error) {
        logger.error('增量更新回调执行错误:', error);
      }
    }
  }
  
  destroy() {
    // 清理资源
    this.callbacks = [];
    if (logger.isDebugEnabled()) {
      logger.debug('增量更新追踪器已销毁');
    }
  }
}

/**
 * 创建增量更新扩展
 * 遵循CodeMirror的函数式编程模型
 */
export const incrementalUpdateExtension = (): Extension => {
  return ViewPlugin.define((view) => new IncrementalUpdateTracker(view));
}; 