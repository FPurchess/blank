import { Command } from 'prosemirror-state';

import { invoke } from '@tauri-apps/api';
import { open } from '@tauri-apps/api/dialog';

import { markdownParser } from '../serializers';
import { path } from '../state';

export default (): Command => (state, dispatch) => {
  (async () => {
    const newPath = await open({
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (typeof newPath === 'string') {
      path.value = newPath;
      const content = await invoke<string>('open_file', { path: path.value });
      const doc = markdownParser.parse(content);
      if (dispatch && doc !== null) {
        dispatch(state.tr.replaceWith(0, state.doc.content.size, doc));
      }
    }
  })();

  return true;
};
