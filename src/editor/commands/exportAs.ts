import { Command } from 'prosemirror-state';

import { DialogFilter, save } from '@tauri-apps/api/dialog';
import { writeBinaryFile } from '@tauri-apps/api/fs';
import { sendNotification } from '@tauri-apps/api/notification';

import { exporterFunc } from '../../exporters';

export default (
    title: string,
    exporter: exporterFunc,
    filters?: DialogFilter,
  ): Command =>
  (state) => {
    const isEmpty =
      (document.querySelector('.ProseMirror')?.textContent ?? '').trim()
        .length === 0;

    if (isEmpty) {
      sendNotification({
        title,
        body: 'Your document is empty. There is nothing to export.',
      });
      return false;
    }

    (async () => {
      const dest = await save({ filters });
      if (dest === null) {
        return false;
      }

      const contents = await exporter(state);
      await writeBinaryFile(dest, contents);

      return true;
    })()
      .then((isExported: boolean) => {
        if (isExported) {
          sendNotification({
            title,
            body: 'Your file has been exported',
          });
        }
      })
      .catch((err: Error) => {
        const error = err.message ?? JSON.stringify(err);
        sendNotification({
          title,
          body: `Failed to export file: ${error}`,
        });
      });

    return true;
  };
