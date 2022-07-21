import { Command } from 'prosemirror-state';

import { open } from '@tauri-apps/api/dialog';
import { readTextFile } from '@tauri-apps/api/fs';

import { markdownParser } from '../serializers';
import { path } from '../state';
import { sendNotification } from '@tauri-apps/api/notification';

export default (): Command => (state, dispatch) => {
  (async () => {
    const newPath = await open({
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (typeof newPath === 'string') {
      path.value = newPath;
      const content = await readTextFile(path.value);
      const doc = markdownParser.parse(content);
      if (dispatch && doc !== null) {
        dispatch(state.tr.replaceWith(0, state.doc.content.size, doc));
      }
    }
  })().catch((err) => {
    sendNotification(`Failed to open file: ${JSON.stringify(err)}`);
  });

  return true;
};
