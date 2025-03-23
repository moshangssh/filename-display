import { TitleExtractorSettings } from './types';
import { CacheCleanStrategy } from './services/interfaces/IServices';

export const DEFAULT_SETTINGS: TitleExtractorSettings = {
    pattern: '(?<=\\d{4}_\\d{2}_\\d{2}_).*$',  // 匹配日期后的所有内容
    useYamlTitleWhenAvailable: true,  // 启用使用YAML前置元数据中的标题
    preferFrontmatterTitle: true,  // 优先使用元数据中的标题而不是文件名
    enabledFolders: [],  // 新增：启用插件的文件夹路径列表，默认为空数组（对所有文件夹生效）
    enableEditorLinkDecorations: true,  // 新增：启用编辑器链接装饰功能，默认开启
    cacheCleanStrategy: CacheCleanStrategy.LRU,  // 默认使用LRU缓存清理策略
    persistentCacheHeatThreshold: 5,  // 默认热度阈值
    fallbackToDOMForFileExplorer: true,  // 默认启用DOM回退
    cacheMigrationV1: false,  // 默认未完成V1版本的缓存迁移
    performanceThreshold: 50,  // 默认性能监控阈值：50ms
    // 新增：文件处理优先级设置默认值
    processingPriority: {
        highPriorityFolders: [],   // 默认无高优先级文件夹
        lowPriorityFolders: []     // 默认无低优先级文件夹
    },
    // 新增：额外正则表达式配置默认值
    additionalPatterns: {
        enabled: false,            // 默认不启用额外正则表达式
        patterns: [],              // 默认无额外正则表达式
        matchMode: 'first'         // 默认使用第一个匹配
    },
    // 新增：自定义缓存策略参数默认值
    cacheSettings: {
        maxDisplayNameEntries: 1000,  // 显示名称缓存默认最大1000条
        maxLinkEntries: 5000,         // 链接缓存默认最大5000条
        maxDecorationEntries: 2000,   // 装饰缓存默认最大2000条
        expiryTime: 30                // 默认缓存过期时间30分钟
    },
    // 新增：调试模式默认值
    debugMode: false               // 默认不启用调试模式
}; 