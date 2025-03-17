// 日志工具服务，提供统一的日志记录功能
// 导出LoggerService作为统一的日志服务实现
import { LoggerService } from '../services/LoggerService';
export { LoggerService as Logger };

// 为了向后兼容，保留默认实例
export const logger = new LoggerService('FilenameDisplay'); 