import { Transaction } from 'prosemirror-state';
import { Node } from 'prosemirror-model';

import { debounce, Observable } from './utils/observable';

export const path = new Observable<string | null>(null);

export const transaction = new Observable<Transaction | null>(null);

export const textContent = new Observable('');
transaction.subscribe(
  debounce((transaction: Transaction) => {
    if (transaction !== null) {
      let content = '';
      transaction.doc.descendants((node: Node) => {
        if (node.marks.find((mark) => mark.type.name === 'deletion')) {
          //
        } else if (node.isBlock) {
          content += '\n';
        } else if (node.isText) {
          content += node.text ?? '';
        }
      });
      content = content.replaceAll(/[\n|\s]{2,}/g, ' ').trim();
      textContent.value = content;
    }
  }, 50),
);

export type themeType = 'light' | 'dark';
export const theme = new Observable<themeType>('dark');
theme.subscribe((value: themeType) => {
  document.body.dataset.theme = value;
});
