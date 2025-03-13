import { Extension } from '@codemirror/state';
import { ViewPlugin, ViewUpdate, EditorView } from '@codemirror/view';

interface ViewportState {
  visible: boolean;
  from: number;
  to: number;
}

export const viewportExtension = (): Extension => {
  return ViewPlugin.define((view) => {
    return {
      update(update: ViewUpdate) {
        if (!update.viewportChanged) return;

        const viewport = view.viewport;
        // 在这里处理视口变化
        console.log('Viewport changed:', {
          from: viewport.from,
          to: viewport.to,
        });
      },
    };
  });
}; 