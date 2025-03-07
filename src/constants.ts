import { FilenameDisplaySettings } from './types';

export const DEFAULT_SETTINGS: FilenameDisplaySettings = {
    pattern: '(?<=\\d{4}_\\d{2}_\\d{2}_).*$',  // 匹配日期后的所有内容
    useYamlTitleWhenAvailable: true,  // 启用使用YAML前置元数据中的标题
    preferFrontmatterTitle: true,  // 优先使用元数据中的标题而不是文件名
    enabledFolders: []  // 新增：启用插件的文件夹路径列表，默认为空数组（对所有文件夹生效）
}; 