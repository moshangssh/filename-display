import { App, MarkdownView, WorkspaceLeaf, Plugin } from 'obsidian';
import { 
    fromEvent, 
    Observable, 
    Subject, 
    debounceTime, 
    distinctUntilChanged, 
    map, 
    tap,
    filter,
    switchMap,
    takeUntil
} from 'rxjs';
import { 
    debounceFn, 
    createDebouncedObservable 
} from '../utils/debounceIntegration';

/**
 * Obsidian插件中使用RxJS的防抖示例
 */
export class RxJSExample {
    private destroy$ = new Subject<void>();
    private searchInput$ = new Subject<string>();
    
    constructor(private app: App, private plugin: Plugin) {
        // RxJS实现已默认启用
    }
    
    /**
     * 初始化RxJS流
     */
    public initialize(): void {
        // 基本搜索功能示例
        this.searchInput$.pipe(
            debounceTime(300),                // 等待用户停止输入
            distinctUntilChanged(),           // 仅处理变化的值
            filter(query => query.length > 2), // 至少3个字符才触发搜索
            tap(query => console.log(`搜索: ${query}`)),
            takeUntil(this.destroy$)          // 组件销毁时自动取消订阅
        ).subscribe(query => {
            // 执行搜索逻辑
            this.performSearch(query);
        });
        
        // 监听编辑器变化
        this.setupEditorChangeListener();
    }
    
    /**
     * 监听活动编辑器内容变化
     */
    private setupEditorChangeListener(): void {
        // 监听工作区变化
        this.app.workspace.on('active-leaf-change', (leaf: WorkspaceLeaf | null) => {
            if (leaf?.view instanceof MarkdownView) {
                const editor = leaf.view.editor;
                
                // 使用统一API的防抖函数
                const processChange = debounceFn((content: string) => {
                    console.log('文档内容已更新，长度:', content.length);
                    // 这里可以执行进一步处理...
                    return content.length;
                }, 500, false, 'editorChange');
                
                // 使用RxJS创建可观察对象来监听编辑器变化
                const editorChange$ = new Observable<string>(observer => {
                    // 创建回调函数
                    const onChange = () => {
                        observer.next(editor.getValue());
                    };
                    
                    // 使用Obsidian编辑器API订阅变化
                    // 这里我们直接轮询编辑器内容作为替代方案
                    const interval = setInterval(() => {
                        onChange();
                    }, 1000); // 每秒检查一次变化
                    
                    // 返回清理函数
                    return () => {
                        clearInterval(interval);
                    };
                });
                
                // 添加防抖处理
                editorChange$.pipe(
                    debounceTime(500),
                    distinctUntilChanged(), // 只在内容变化时触发
                    takeUntil(this.destroy$)
                ).subscribe(content => {
                    processChange(content);
                });
            }
        });
    }
    
    /**
     * DOM事件与RxJS集成示例
     * @param element 要监听的DOM元素
     */
    public setupDOMListeners(element: HTMLElement): void {
        // 为输入框创建Observable
        if (element) {
            // 从输入事件创建Observable
            const input$ = fromEvent<InputEvent>(element, 'input').pipe(
                map(e => (e.target as HTMLInputElement).value),
                debounceTime(300),
                distinctUntilChanged()
            );
            
            // 订阅输入变化
            input$.pipe(
                takeUntil(this.destroy$)
            ).subscribe(value => {
                this.searchInput$.next(value);
            });
        }
    }
    
    /**
     * 复杂链式操作示例
     * 展示RxJS的强大功能
     */
    public setupAdvancedExample(): void {
        // 创建Observable形式的防抖，使用统一API
        const { observable: search$, next: triggerSearch } = createDebouncedObservable<string>(300);
        
        // 构建复杂的处理管道
        search$.pipe(
            // 过滤有效查询
            filter(query => query.length > 2),
            
            // 执行API调用并处理结果
            switchMap(query => {
                console.log(`执行API调用: ${query}`);
                // 模拟API调用
                return new Observable<string[]>(observer => {
                    setTimeout(() => {
                        observer.next([`结果1: ${query}`, `结果2: ${query}`]);
                        observer.complete();
                    }, 500);
                });
            }),
            
            // 记录执行时间
            tap(results => {
                console.log(`找到 ${results.length} 个结果`);
            }),
            
            // 取消订阅
            takeUntil(this.destroy$)
        ).subscribe({
            next: results => {
                // 显示结果
                this.displayResults(results);
            },
            error: err => {
                console.error('搜索错误', err);
            }
        });
        
        // 触发搜索
        triggerSearch('示例查询');
    }
    
    /**
     * 执行搜索
     */
    private performSearch(query: string): void {
        console.log(`执行搜索: ${query}`);
        // 实际搜索逻辑...
    }
    
    /**
     * 显示结果
     */
    private displayResults(results: string[]): void {
        console.log('显示结果:', results);
        // 实际显示逻辑...
    }
    
    /**
     * 清理资源
     */
    public destroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }
} 