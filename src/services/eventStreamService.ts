import { Subject, Observable, merge } from 'rxjs';
import { throttleTime, debounceTime, distinctUntilChanged, map, share, filter } from 'rxjs/operators';
import { TAbstractFile, TFile, TFolder } from 'obsidian';

/**
 * 文件事件类型枚举
 */
export enum FileEventType {
    CREATE = 'create',
    MODIFY = 'modify', 
    DELETE = 'delete',
    RENAME = 'rename'
}

/**
 * 文件事件接口
 */
export interface FileEvent {
    type: FileEventType;
    file: TAbstractFile;
    oldPath?: string;
}

/**
 * 事件流配置接口
 */
export interface EventStreamConfig {
    throttleTimeMs: number;  // 节流时间（毫秒）
    debounceTimeMs: number;  // 去抖时间（毫秒）
}

/**
 * 事件流服务类
 * 使用RxJS处理文件事件流
 */
export class EventStreamService {
    private config: EventStreamConfig;
    
    // 各类型事件的原始Subject
    private createSubject = new Subject<FileEvent>();
    private modifySubject = new Subject<FileEvent>();
    private deleteSubject = new Subject<FileEvent>();
    private renameSubject = new Subject<FileEvent>();
    
    // 合并后的事件流
    private combinedStream$: Observable<FileEvent>;
    
    /**
     * 构造函数
     * @param config 事件流配置
     */
    constructor(config: EventStreamConfig = { 
        throttleTimeMs: 300, 
        debounceTimeMs: 500 
    }) {
        this.config = config;
        
        // 使用节流处理创建和修改事件
        const create$ = this.createSubject.pipe(
            throttleTime(this.config.throttleTimeMs),
            share()
        );
        
        const modify$ = this.modifySubject.pipe(
            throttleTime(this.config.throttleTimeMs),
            share()
        );
        
        // 使用去抖处理删除和重命名事件
        const delete$ = this.deleteSubject.pipe(
            debounceTime(this.config.debounceTimeMs),
            share()
        );
        
        const rename$ = this.renameSubject.pipe(
            debounceTime(this.config.debounceTimeMs),
            share()
        );
        
        // 合并所有事件流
        this.combinedStream$ = merge(
            create$,
            modify$,
            delete$,
            rename$
        ).pipe(
            // 通过文件路径和事件类型去重
            distinctUntilChanged((prev, curr) => {
                if (prev.type !== curr.type) return false;
                return prev.file.path === curr.file.path;
            }),
            share()
        );
    }
    
    /**
     * 更新配置
     */
    public updateConfig(config: Partial<EventStreamConfig>): void {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 发送创建事件
     */
    public emitCreate(file: TAbstractFile): void {
        this.createSubject.next({
            type: FileEventType.CREATE,
            file
        });
    }
    
    /**
     * 发送修改事件
     */
    public emitModify(file: TAbstractFile): void {
        this.modifySubject.next({
            type: FileEventType.MODIFY,
            file
        });
    }
    
    /**
     * 发送删除事件
     */
    public emitDelete(file: TAbstractFile): void {
        this.deleteSubject.next({
            type: FileEventType.DELETE,
            file
        });
    }
    
    /**
     * 发送重命名事件
     */
    public emitRename(file: TAbstractFile, oldPath: string): void {
        this.renameSubject.next({
            type: FileEventType.RENAME,
            file,
            oldPath
        });
    }
    
    /**
     * 获取合并后的事件流
     */
    public getCombinedStream(): Observable<FileEvent> {
        return this.combinedStream$;
    }
    
    /**
     * 获取特定文件夹内的事件流
     * @param folderPath 文件夹路径
     */
    public getFolderStream(folderPath: string): Observable<FileEvent> {
        return this.combinedStream$.pipe(
            map(event => {
                // 检查文件是否在指定文件夹内
                const filePath = event.file.path;
                return filePath.startsWith(folderPath) ? event : null;
            }),
            // 过滤掉null值
            filter((event): event is FileEvent => event !== null),
            // 过滤掉不在文件夹内的事件
            distinctUntilChanged((prev, curr) => {
                return prev.file.path === curr.file.path && 
                       prev.type === curr.type;
            })
        );
    }
    
    /**
     * 获取特定文件类型的事件流
     * @param extension 文件扩展名（如 "md"）
     */
    public getFileTypeStream(extension: string): Observable<FileEvent> {
        return this.combinedStream$.pipe(
            map(event => {
                // 检查是否为TFile并且扩展名匹配
                if (event.file instanceof TFile && 
                    event.file.extension === extension) {
                    return event;
                }
                return null;
            }),
            // 过滤掉null值
            filter((event): event is FileEvent => event !== null),
            // 过滤掉不符合条件的事件
            distinctUntilChanged((prev, curr) => {
                return prev.file.path === curr.file.path && 
                       prev.type === curr.type;
            })
        );
    }
} 