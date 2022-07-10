import { Command } from 'prosemirror-state';

import { invoke } from '@tauri-apps/api';
import { save } from '@tauri-apps/api/dialog';

import { markdownSerializer } from '../serializers';
import { path } from '../state';

export default (force = false): Command =>
  (state) => {
    (async () => {
      if (force || path === null) {
        const newPath = await save({
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        });
        if (typeof newPath === 'string') {
          path.value = newPath;
        } else {
          return;
        }
      }
      const content = markdownSerializer.serialize(state.doc);

      await invoke('save_file', { path: path.value, content });
    })();

    return true;
  };
