import {
  isPermissionGranted,
  requestPermission,
} from '@tauri-apps/api/notification';

import { path, textContent } from './state';

export const setupNotification = async () => {
  const hasPermission = await isPermissionGranted();
  if (!hasPermission) {
    await requestPermission();
  }
};

export const bootUI = () => {
  const uiTop = document.createElement('div');
  uiTop.id = 'ui-top';
  document.body.appendChild(uiTop);
  path.subscribe(
    (path) => {
      uiTop.innerHTML = '&raquo; ' + (path ?? 'Untitled');
    },
    { immediate: true },
  );

  const uiBottom = document.createElement('div');
  uiBottom.id = 'ui-bottom';
  document.body.appendChild(uiBottom);
  textContent.subscribe(
    (content) => {
      const charCount = content.length;
      const wordCount = content.length ? content.split(/\s/).length : 0;
      uiBottom.innerHTML = `${wordCount} words ${charCount} chars`;
    },
    { immediate: true },
  );

  // FIXME: better handling of permission errors
  setupNotification().catch(console.error);
};
