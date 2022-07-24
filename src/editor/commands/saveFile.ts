import { Command, EditorState } from 'prosemirror-state';

import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';
import { sendNotification } from '@tauri-apps/api/notification';

import { markdownSerializer } from '../../serializers';
import { path } from '../../state';

export interface Options {
  force?: boolean;
}

export const _saveFile = async (state: EditorState, options: Options) => {
  try {
    if (options.force === true || path.value === null) {
      const newPath = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (newPath === null) {
        return;
      }
      path.value = newPath;
    }

    const content = markdownSerializer.serialize(state.doc) ?? '';
    await writeTextFile(path.value, content);

    sendNotification('Your file has been saved');
  } catch (err) {
    if (err instanceof Error) {
      sendNotification(`Failed to save file: ${err.message}`);
    } else if (typeof err === 'string') {
      sendNotification(`Failed to save file: ${err}`);
    }
  }
};

export default (options: Options = { force: false }): Command =>
  (state) => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    _saveFile(state, Object.freeze(options));
    return true;
  };
