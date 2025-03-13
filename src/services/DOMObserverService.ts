import { Logger } from '../utils/logger';
import type { ITitleExtractorPlugin } from '../types';

const logger = new Logger('DOMObserverService');

interface MutationRecord {
  type: 'childList' | 'attributes' | 'characterData';
  target: Node;
  addedNodes: NodeList;
  removedNodes: NodeList;
  attributeName?: string;
  attributeNamespace?: string;
  oldValue?: string;
}

interface BatchUpdate {
  records: MutationRecord[];
  timestamp: number;
}

export class DOMObserverService {
  private observer: MutationObserver | null = null;
  private batchQueue: BatchUpdate[] = [];
  private isProcessing = false;
  private readonly BATCH_DELAY = 100; // 批处理延迟（毫秒）
  private readonly MAX_BATCH_SIZE = 50; // 最大批处理大小
  private readonly IDLE_TIMEOUT = 1000; // 空闲超时时间（毫秒）

  constructor(private readonly plugin: ITitleExtractorPlugin) {}

  /**
   * 初始化 DOM 观察器
   */
  public initialize(): void {
    try {
      // 配置 MutationObserver
      const config: MutationObserverInit = {
        childList: true, // 观察子节点变化
        subtree: true,   // 观察所有后代节点
        attributes: true, // 观察属性变化
        characterData: true, // 观察文本内容变化
        attributeFilter: ['href', 'data-href'], // 只观察特定属性
        attributeOldValue: true // 记录属性旧值
      };

      // 创建观察器
      this.observer = new MutationObserver(this.handleMutations.bind(this));
      
      // 开始观察
      this.startObserving();
      
      logger.log('DOM 观察器初始化完成');
    } catch (error) {
      logger.error('初始化 DOM 观察器失败:', error);
      throw error;
    }
  }

  /**
   * 开始观察 DOM 变化
   */
  private startObserving(): void {
    if (!this.observer) return;

    try {
      // 观察整个文档
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
        attributeFilter: ['href', 'data-href'],
        attributeOldValue: true
      });

      logger.log('开始观察 DOM 变化');
    } catch (error) {
      logger.error('启动 DOM 观察失败:', error);
      throw error;
    }
  }

  /**
   * 处理 DOM 变化
   */
  private handleMutations(mutations: MutationRecord[]): void {
    try {
      // 将变化添加到批处理队列
      this.batchQueue.push({
        records: mutations,
        timestamp: Date.now()
      });

      // 如果队列未满，等待更多变化
      if (this.batchQueue.length < this.MAX_BATCH_SIZE) {
        this.scheduleBatchProcessing();
      } else {
        // 队列已满，立即处理
        this.processBatchQueue();
      }
    } catch (error) {
      logger.error('处理 DOM 变化失败:', error);
    }
  }

  /**
   * 调度批处理
   */
  private scheduleBatchProcessing(): void {
    if (this.isProcessing) return;

    // 使用 requestIdleCallback 在空闲期处理
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(
        () => this.processBatchQueue(),
        { timeout: this.IDLE_TIMEOUT }
      );
    } else {
      // 降级使用 setTimeout
      setTimeout(() => this.processBatchQueue(), this.BATCH_DELAY);
    }
  }

  /**
   * 处理批处理队列
   */
  private async processBatchQueue(): Promise<void> {
    if (this.isProcessing || this.batchQueue.length === 0) return;

    this.isProcessing = true;
    try {
      // 合并所有变化记录
      const allRecords = this.batchQueue.reduce((acc, batch) => {
        acc.push(...batch.records);
        return acc;
      }, [] as MutationRecord[]);

      // 清空队列
      this.batchQueue = [];

      // 处理变化
      await this.processMutations(allRecords);
    } catch (error) {
      logger.error('处理批处理队列失败:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 处理变化记录
   */
  private async processMutations(records: MutationRecord[]): Promise<void> {
    try {
      // 按类型分组处理变化
      const groupedRecords = this.groupMutationsByType(records);

      // 处理每种类型的变化
      for (const [type, typeRecords] of Object.entries(groupedRecords)) {
        await this.handleMutationType(type as keyof typeof groupedRecords, typeRecords);
      }
    } catch (error) {
      logger.error('处理变化记录失败:', error);
    }
  }

  /**
   * 按类型分组变化记录
   */
  private groupMutationsByType(records: MutationRecord[]): Record<string, MutationRecord[]> {
    return records.reduce((acc, record) => {
      if (!acc[record.type]) {
        acc[record.type] = [];
      }
      acc[record.type].push(record);
      return acc;
    }, {} as Record<string, MutationRecord[]>);
  }

  /**
   * 处理特定类型的变化
   */
  private async handleMutationType(type: string, records: MutationRecord[]): Promise<void> {
    switch (type) {
      case 'childList':
        await this.handleChildListMutations(records);
        break;
      case 'attributes':
        await this.handleAttributeMutations(records);
        break;
      case 'characterData':
        await this.handleCharacterDataMutations(records);
        break;
    }
  }

  /**
   * 处理子节点变化
   */
  private async handleChildListMutations(records: MutationRecord[]): Promise<void> {
    // 处理添加的节点
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof HTMLElement && this.isLinkNode(node)) {
          await this.processLinkNode(node);
        }
      }
    }
  }

  /**
   * 处理属性变化
   */
  private async handleAttributeMutations(records: MutationRecord[]): Promise<void> {
    for (const record of records) {
      if (record.target instanceof HTMLElement && this.isLinkNode(record.target)) {
        await this.processLinkNode(record.target);
      }
    }
  }

  /**
   * 处理文本内容变化
   */
  private async handleCharacterDataMutations(records: MutationRecord[]): Promise<void> {
    for (const record of records) {
      const parent = record.target.parentNode;
      if (parent instanceof HTMLElement && this.isLinkNode(parent)) {
        await this.processLinkNode(parent);
      }
    }
  }

  /**
   * 判断是否为链接节点
   */
  private isLinkNode(node: Node): boolean {
    return node instanceof HTMLElement && (
      node.tagName === 'A' ||
      node.hasAttribute('data-href') ||
      node.classList.contains('internal-link')
    );
  }

  /**
   * 处理链接节点
   */
  private async processLinkNode(node: HTMLElement): Promise<void> {
    try {
      // 获取链接地址
      const href = node.getAttribute('href') || node.getAttribute('data-href');
      if (!href) return;

      // 更新链接显示
      await this.plugin.updateAllFilesDisplay();
    } catch (error) {
      logger.error('处理链接节点失败:', error);
    }
  }

  /**
   * 停止观察
   */
  public stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      this.batchQueue = [];
      this.isProcessing = false;
      logger.log('停止观察 DOM 变化');
    }
  }
} 