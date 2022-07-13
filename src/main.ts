import { bootStorage } from './storage';
import { bootEditor } from './editor';
import { bootUI } from './ui';

import './scss/main.scss';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  await bootStorage();
  await bootEditor();
  bootUI();
})();
