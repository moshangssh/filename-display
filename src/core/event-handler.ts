import { Plugin, TFile, TFolder } from 'obsidian';
import { DebounceService } from '../services/debounce-service';
import { ValidationHelper } from '../utils/validation';
import { MyPluginSettings } from '../types/interfaces';
import { FileNameDisplayPlugin } from './plugin';
import { PerformanceMonitor } from '../utils/performance-decorator';

export class EventHandler {
    private debounceService: DebounceService;
    private performanceMonitor: PerformanceMonitor;

    constructor(
        private plugin: FileNameDisplayPlugin,
        private settings: MyPluginSettings,
        private updateCallback: () => void
    ) {
        this.debounceService = new DebounceService();
        this.performanceMonitor = new PerformanceMonitor();
        this.initializeEventListeners();
    }

    private initializeEventListeners(): void {
        type WorkspaceEvent = 'file-open';
        type VaultEvent = 'rename' | 'create' | 'delete';
        
        const events: Array<{
            source: typeof this.plugin.app.workspace | typeof this.plugin.app.vault;
            event: WorkspaceEvent | VaultEvent;
        }> = [
            { source: this.plugin.app.workspace, event: 'file-open' },
            { source: this.plugin.app.vault, event: 'rename' },
            { source: this.plugin.app.vault, event: 'create' },
            { source: this.plugin.app.vault, event: 'delete' }
        ];

        events.forEach(({ source, event }) => {
            this.plugin.registerEvent(
                source.on(event as any, () => {
                    this.handleFileEvent(event);
                })
            );
        });

        // 链接点击事件
        this.plugin.registerDomEvent(document, 'click', (evt: MouseEvent) => {
            this.handleLinkClick(evt);
        });
    }

    private handleFileEvent(eventType: string): void {
        if (!this.settings.enablePlugin) return;

        const debouncedUpdate = this.debounceService.debounce(
            eventType,
            () => {
                this.updateCallback();
                this.performanceMonitor.recordUpdate();
            },
            500
        );

        debouncedUpdate();
    }

    private handleLinkClick(evt: MouseEvent): void {
        const target = evt.target as HTMLElement;
        if (!target.matches('.internal-link, .cm-hmd-internal-link')) return;

        evt.preventDefault();
        const linkText = target.textContent;
        if (!linkText) return;

        // 使用公共方法获取原始文件名
        const originalName = this.plugin.getOriginalFileName(linkText) || linkText;
        
        // 使用 Obsidian API 打开链接
        this.plugin.app.workspace.openLinkText(
            originalName,
            '', // 源文件路径,这里可以为空
            evt.ctrlKey || evt.metaKey // 是否在新窗口打开
        );
    }

    destroy(): void {
        this.debounceService.clearAll();
        this.performanceMonitor.reset();
    }
}
