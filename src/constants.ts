import { FilenameDisplaySettings } from './types';

export const DEFAULT_SETTINGS: FilenameDisplaySettings = {
    pattern: '(?<=\\d{4}_\\d{2}_\\d{2}_).*$'  // 匹配日期后的所有内容
}; 