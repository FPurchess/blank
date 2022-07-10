import { Command } from 'prosemirror-state';

import { invoke } from '@tauri-apps/api';
import { save } from '@tauri-apps/api/dialog';
import { sendNotification } from '@tauri-apps/api/notification';

import { htmlSerializer } from '../serializers';

import css from '../scss/main.scss';

export default (): Command => (state) => {
  const html = htmlSerializer(state.doc).trim();
  const isEmpty = html.replaceAll(/<[^>]*>/g, '').length === 0;

  if (isEmpty) {
    sendNotification({
      title: 'PDF Export',
      body: 'Your document is empty. There is nothing to export.',
    });
    return false;
  }

  (async () => {
    const pdfPath = await save({
      filters: [
        {
          name: 'PDF-File',
          extensions: ['pdf'],
        },
      ],
    });
    if (pdfPath === null) {
      return false;
    }
    const content = `<!DOCTYPE html><html><head><style>${css}</style></head><body data-theme="light">${html}</body></html>`;
    await invoke('export_as_pdf', { path: pdfPath, content });
    return true;
  })()
    .then((isExported: boolean) => {
      if (isExported) {
        sendNotification('Your file has been exported');
      }
    })
    .catch((err) => {
      sendNotification(`Failed to export file: ${JSON.stringify(err)}`);
    });

  return true;
};
