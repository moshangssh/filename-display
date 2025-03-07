import { FilenameDisplaySettings } from './types';

export const DEFAULT_SETTINGS: FilenameDisplaySettings = {
    pattern: '(?<=\\d{4}_\\d{2}_\\d{2}_).*$',  // 匹配日期后的所有内容
    useYamlTitleWhenAvailable: true,  // 启用使用YAML前置元数据中的标题
    preferFrontmatterTitle: true  // 优先使用元数据中的标题而不是文件名
}; 