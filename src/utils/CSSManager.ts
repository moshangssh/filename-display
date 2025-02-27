export class CSSManager {
  private static instance: CSSManager;
  private styleCache: Map<string, string>;
  private styleElement: HTMLStyleElement | null;

  private constructor() {
    this.styleCache = new Map();
    this.styleElement = null;
  }

  public static getInstance(): CSSManager {
    if (!CSSManager.instance) {
      CSSManager.instance = new CSSManager();
    }
    return CSSManager.instance;
  }

  // 初始化样式元素
  private initStyleElement(): void {
    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'dynamic-styles';
      document.head.appendChild(this.styleElement);
    }
  }

  // 更新样式
  public updateStyle(fileId: string, newStyle: string): void {
    if (this.styleCache.get(fileId) === newStyle) {
      return;
    }

    this.styleCache.set(fileId, newStyle);
    this.injectStyles();
  }

  // 删除样式
  public removeStyle(fileId: string): void {
    if (this.styleCache.has(fileId)) {
      this.styleCache.delete(fileId);
      this.injectStyles();
    }
  }

  // 注入样式
  private injectStyles(): void {
    this.initStyleElement();
    if (this.styleElement) {
      const styles = Array.from(this.styleCache.values()).join('\n');
      this.styleElement.textContent = styles;
    }
  }

  // 清理所有样式
  public clearStyles(): void {
    this.styleCache.clear();
    if (this.styleElement) {
      this.styleElement.textContent = '';
    }
  }

  // 获取样式缓存大小
  public getCacheSize(): number {
    return this.styleCache.size;
  }

  // 检查样式是否存在
  public hasStyle(fileId: string): boolean {
    return this.styleCache.has(fileId);
  }
} 