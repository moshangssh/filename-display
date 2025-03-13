import { Extension } from '@codemirror/state';
import { ViewPlugin, ViewUpdate, EditorView } from '@codemirror/view';
import { Logger } from '../utils/logger';

const logger = new Logger('IncrementalUpdate');

export const incrementalUpdateExtension = (): Extension => {
  return ViewPlugin.define((view) => {
    return {
      update(update: ViewUpdate) {
        if (!update.docChanged) return;

        // 获取文档变更范围
        const changes = update.changes;
        const ranges: { from: number; to: number; type: 'add' | 'remove' | 'update' }[] = [];

        // 遍历所有变更
        changes.iterChangedRanges((from, to, fromLen, toLen) => {
          // 根据变更类型分类
          if (fromLen === 0) {
            ranges.push({ from, to, type: 'add' });
          } else if (toLen === 0) {
            ranges.push({ from, to: from + fromLen, type: 'remove' });
          } else {
            ranges.push({ from, to, type: 'update' });
          }
        });

        // 记录更新范围
        logger.log('增量更新范围:', ranges);
      },
    };
  });
}; 