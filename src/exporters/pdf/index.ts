import pdfmake from 'pdfmake';

import { Node, Mark } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';

import { exporterFunc } from '../types';
import { BASE_DOCUMENT } from './template';

export const hasMark = (n: Node, name: string): boolean =>
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

const toPDF: exporterFunc = (state: EditorState) => {
  const content = transformNode(state.doc).text;
  const docDefinition = Object.assign({}, BASE_DOCUMENT, { content });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const pdf = pdfmake.createPdf(docDefinition);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return pdf.getBuffer();
};

export default toPDF;
