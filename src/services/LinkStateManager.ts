import { EditorView } from '@codemirror/view';
import { LoggerService } from "../services/LoggerService";
import { updateTextEffect, updateLinkDisplayName, removeLinkDecoration } from '../extensions';
import type { ITitleExtractorPlugin } from '../types';
import { ILinkStateManager } from './interfaces/IServices';
import { MarkdownView } from 'obsidian';
import { getEditorView } from '../utils/editor-utils';

// 创建服务特定的日志记录器
const logger = new LoggerService('LinkStateManager');

/**
 * 链接状态更新结果
 */
export interface LinkUpdateResult {
  success: boolean;
  error?: Error;
}

/**
 * 链接批处理回调函数类型
 */
export type LinkBatchCallback = (result: { success: boolean; count: number; errors: number }) => void;

/**
 * 链接信息接口
 */
export interface LinkInfo {
  id?: string;
  from: number;
  to: number;
  displayName: string;
  path: string;
}

/**
 * 链接状态管理服务
 * 负责处理编辑器中链接的状态更新
 */
export class LinkStateManager implements ILinkStateManager {
  // 批处理大小
  private readonly batchSize: number = 10;
  // 跟踪批处理的定时器ID
  private batchTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  // 跟踪状态是否已释放
  private isDisposed: boolean = false;
  
  constructor(private plugin: ITitleExtractorPlugin) {
    logger.log('链接状态管理器已初始化');
  }
  
  /**
   * 更新链接文本
   * 使用纯函数式方法处理状态更新
   */
  public updateLinkText(view: EditorView, id: string, newText: string): LinkUpdateResult {
    if (!view) {
      return { success: false, error: new Error('编辑器视图不可用') };
    }
    
    try {
      // 创建状态效果
      const effect = updateTextEffect.of({
        id: id,
        displayName: newText
      });
      
      // 通过事务分发效果
      view.dispatch({
        effects: [effect]
      });
      
      return { success: true };
    } catch (error) {
      logger.error("更新链接文本失败:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error('未知错误') 
      };
    }
  }
  
  /**
   * 更新指定位置的链接显示名称
   */
  public updateLinkDisplayName(view: EditorView, from: number, to: number, displayName: string): LinkUpdateResult {
    if (!view) {
      return { success: false, error: new Error('编辑器视图不可用') };
    }
    
    try {
      // 使用扩展提供的方法更新链接显示名称
      updateLinkDisplayName(view, from, to, displayName);
      return { success: true };
    } catch (error) {
      logger.error("更新链接显示名称失败:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error('未知错误') 
      };
    }
  }
  
  /**
   * 批量处理链接
   * @param view 编辑器视图
   * @param links 需要处理的链接
   * @param callback 处理完成后的回调
   */
  public processBatch(view: EditorView, links: LinkInfo[], callback: LinkBatchCallback): void {
    // 防御性检查：如果已释放资源则不处理
    if (this.isDisposed) {
      logger.warn('尝试在已释放资源的状态管理器上处理批量链接');
      callback({ success: false, count: 0, errors: 0 });
      return;
    }
    
    if (!view || links.length === 0) {
      callback({ success: true, count: 0, errors: 0 });
      return;
    }
    
    let processedCount = 0;
    let errorCount = 0;
    
    // 递归处理批次
    const processBatchWithIndex = (startIndex: number) => {
      // 防御性检查：如果已释放资源则不继续处理批次
      if (this.isDisposed) {
        callback({ 
          success: false, 
          count: processedCount, 
          errors: errorCount 
        });
        return;
      }
      
      // 检查是否处理完所有链接
      if (startIndex >= links.length) {
        callback({ 
          success: true, 
          count: processedCount, 
          errors: errorCount 
        });
        return;
      }
      
      // 计算当前批次范围
      const endIndex = Math.min(startIndex + this.batchSize, links.length);
      const currentBatch = links.slice(startIndex, endIndex);
      
      // 处理当前批次中的每个链接
      for (const link of currentBatch) {
        // 防御性检查：如果已释放资源则不处理链接
        if (this.isDisposed) break;
        
        try {
          if (link.id) {
            // 如果有 ID，使用 ID 更新
            this.updateLinkText(view, link.id, link.displayName);
          } else {
            // 否则使用位置更新
            this.updateLinkDisplayName(view, link.from, link.to, link.displayName);
          }
          processedCount++;
        } catch (error) {
          errorCount++;
          logger.error(`处理链接时出错 [${link.from}-${link.to}]:`, error);
        }
      }
      
      // 处理下一批
      const timerId = setTimeout(() => {
        // 从跟踪集合中移除此定时器
        this.batchTimers.delete(timerId);
        processBatchWithIndex(endIndex);
      }, 0);
      
      // 跟踪定时器以便在必要时清理
      this.batchTimers.add(timerId);
    };
    
    // 开始处理第一批
    processBatchWithIndex(0);
  }
  
  /**
   * 清理资源
   */
  public dispose(): void {
    // 防止重复释放
    if (this.isDisposed) {
      return;
    }
    
    // 标记为已释放
    this.isDisposed = true;
    
    logger.log('正在释放链接状态管理器资源...');
    
    // 清理所有正在运行的批处理定时器
    if (this.batchTimers.size > 0) {
      logger.debug(`清理 ${this.batchTimers.size} 个批处理定时器`);
      for (const timerId of this.batchTimers) {
        clearTimeout(timerId);
      }
      this.batchTimers.clear();
    }
    
    // 清理编辑器视图中的链接装饰
    try {
      const activeView = this.getActiveEditorView();
      if (activeView) {
        this.clearDecorations(activeView);
      }
    } catch (error) {
      logger.error('释放资源时清理链接装饰时出错:', error);
    }
    
    // 解除对插件实例的引用
    (this as any).plugin = null;
    
    logger.log('链接状态管理器资源已完全释放');
  }

  /**
   * 获取当前活动的编辑器视图
   * @private
   */
  private getActiveEditorView(): EditorView | null {
    try {
      const activeLeaf = this.plugin?.app.workspace.activeLeaf;
      if (activeLeaf?.view instanceof MarkdownView) {
        const view = activeLeaf.view as MarkdownView;
        return getEditorView(view);
      }
    } catch (error) {
      logger.error('获取活动编辑器视图失败:', error);
    }
    return null;
  }

  /**
   * 清除编辑器视图中的所有链接装饰
   */
  public clearDecorations(view: EditorView): void {
    if (!view) return;
    
    try {
      // 使用移除装饰效果清除所有装饰
      view.dispatch({
        effects: removeLinkDecoration.of(null)
      });
      
      logger.debug('已清除所有链接装饰');
    } catch (error) {
      logger.error('清除链接装饰时出错:', error);
    }
  }
} 