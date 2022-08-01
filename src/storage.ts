import localforage from 'localforage';
import { Transaction } from 'prosemirror-state';
import { Node } from 'prosemirror-model';
import { schema } from 'prosemirror-markdown';

import { debounce } from 'observable.ts';
import { path, transaction, theme } from './state';

localforage.config({
  name: 'Blank',
  version: '0.1',
});

export const bootStorage = async () => {
  await localforage.ready();

  path.subscribe((value: string | null) => {
    localforage.setItem('path', value).catch(console.warn);
  });

  const _path = await localforage.getItem('path');
  path.value = _path ?? null;

  const _theme = await localforage.getItem('theme');
  theme.value = _theme === 'dark' ? 'dark' : 'light';

  theme.subscribe((value: themeType) => {
    localforage.setItem('theme', value).catch(console.warn);
  });

  transaction.subscribe(
    debounce((tx: Transaction) => {
      localforage.setItem('doc', tx.doc.toJSON()).catch(console.warn);
    }, 1000),
  );
};

export const restoreDocument = async (): Promise<Node | undefined> => {
  const node = await localforage.getItem('doc');
  return node === null ? undefined : Node.fromJSON(schema, node);
};
