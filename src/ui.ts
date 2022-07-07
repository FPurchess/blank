import { Transaction } from 'prosemirror-state';

const uiTop = document.querySelector<HTMLDivElement>('#ui-top')!;
const uiBottom = document.querySelector<HTMLDivElement>('#ui-bottom')!;

export const updateUIHeader = (path: string) => {
  uiTop.innerHTML = '&raquo; ' + path;
};
updateUIHeader('Untitled');

export const updateUIStats = (transaction: Transaction) => {
  let content = '';
  transaction.doc.descendants((node) => {
    if (node.marks.find((mark) => mark.type.name === 'deletion')) {
      return;
    } else if (node.isBlock) {
      content += '\n';
    } else if (node.isText) {
      content += node.text;
    }
  });
  content = content.replaceAll(/\n|\s{2,}/g, ' ').trim();
  const words = content.split(/\s/).length;
  const letters = content.length;
  uiBottom.innerHTML = `${words} words ${letters} chars`;
};
