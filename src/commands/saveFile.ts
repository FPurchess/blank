import { Command } from 'prosemirror-state';

import { invoke } from '@tauri-apps/api';
import { save } from '@tauri-apps/api/dialog';
import { sendNotification } from '@tauri-apps/api/notification';

import { markdownSerializer } from '../serializers';
import { path } from '../state';

export default (force = false): Command =>
  (state) => {
    (async () => {
      if (force || path.value === null) {
        const newPath = await save({
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        });
        if (newPath === null) {
          return false;
        }
        path.value = newPath;
      }

      const content = markdownSerializer.serialize(state.doc) ?? '';
      await invoke('save_file', { path: path.value, content });

      return true;
    })()
      .then((isExported: boolean) => {
        if (isExported) {
          sendNotification('Your files has been saved');
        }
      })
      .catch((err) => {
        sendNotification(`Failed to save file: ${JSON.stringify(err)}`);
      });

    return true;
  };
