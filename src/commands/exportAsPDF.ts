import { Command } from 'prosemirror-state';
import { Node, Mark } from 'prosemirror-model';

import { save } from '@tauri-apps/api/dialog';
import { writeBinaryFile } from '@tauri-apps/api/fs';
import { sendNotification } from '@tauri-apps/api/notification';

import pdfmake from 'pdfmake';

const textStyleMixin = (
  fontSize,
  options: {
    italics?: boolean;
    bold?: boolean;
    decoration?: 'underline';
    margin?: number[];
  } = {},
) => ({
  fontSize,
  // margin: [left, top, right, bottom]
  margin: [0, fontSize * 0.75, 0, fontSize * 0.25],
  ...options,
});

const BASE_DOCUMENT = {
  defaultStyle: {
    font: 'DejaVu Sans',
  },
  styles: {
    paragraph: textStyleMixin(10, { margin: [0, 0, 0, 10] }),
    heading1: textStyleMixin(30),
    heading2: textStyleMixin(25),
    heading3: textStyleMixin(20),
    heading4: textStyleMixin(15),
    heading5: textStyleMixin(12),
    heading6: textStyleMixin(10, { bold: true }),
    list_item: textStyleMixin(10, { margin: [15, 5, 0, 0] }),
    bullet_list: { margin: [0, 0, 0, 10] },
    ordered_list: { margin: [0, 0, 0, 10] },
  },
};

const hasMark = (n: Node, name: string): boolean =>
  n.marks.find((mark: Mark) => mark.type.name === name) !== undefined;

// TODO: support hard breaks and horizontal lines
const transformNode = (n: Node) => {
  const item = {
    style: `${n.type.name}${(n.attrs.level as number) ?? ''}`,
    stack: undefined,
    ul: undefined,
    ol: undefined,
    text: undefined,
    italics: hasMark(n, 'em'),
    bold: hasMark(n, 'strong'),
    decoration: hasMark(n, 'u') ? 'underline' : undefined,
  };

  switch (n.type.name) {
    case 'text':
      item.text = n.text ?? '';
      break;

    case 'bullet_list':
      item.ul = [];
      n.forEach((node) => {
        item.ul.push(transformNode(node));
      });
      break;

    case 'ordered_list':
      item.ol = [];
      n.forEach((node) => {
        item.ol.push(transformNode(node));
      });
      break;

    default:
      item.text = [];
      n.forEach((node) => {
        item.text.push(transformNode(node));
      });
  }

  return item;
};

export default (): Command => (state) => {
  const isEmpty =
    (document.querySelector('.ProseMirror')?.textContent ?? '').trim()
      .length === 0;

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

    const content = transformNode(state.doc).text;
    const docDefinition = Object.assign({}, BASE_DOCUMENT, { content });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const pdf = pdfmake.createPdf(docDefinition);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const buf = await pdf.getBuffer();
    await writeBinaryFile(pdfPath, buf);

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
