import pdfmake from 'pdfmake';
import vfs from './exporters/pdf/pdfmake-vfs';

import { bootStorage } from './storage';
import { bootEditor } from './editor';
import { bootUI } from './ui';

import './scss/main.scss';

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
pdfmake.addVirtualFileSystem(vfs); // @tslint-ignore

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
pdfmake.addFonts({
  'DejaVu Sans': {
    normal: 'dejavu-sans.ttf',
    bold: 'dejavu-sans.ttf',
    italics: 'dejavu-sans.ttf',
    bolditalics: 'dejavu-sans.ttf',
  },
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  await bootStorage();
  await bootEditor();
  bootUI();
})();
