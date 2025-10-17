import localforage from "localforage";
import { Transaction } from "prosemirror-state";
import { Node } from "prosemirror-model";

import { debounce } from "observable.ts";
import { path, transaction, theme, themeType, themes } from "./state";
import { schema } from "prosemirror-markdown";

localforage.config({
  name: "Blank",
  version: 1,
});

export const bootStorage = async () => {
  await localforage.ready();

  path.subscribe((value: string | null) => {
    localforage.setItem("path", value).catch(console.warn);
  });

  const _theme = await localforage.getItem("theme");
  theme.value = themes.includes(_theme as string)
    ? (_theme as themeType)
    : themes[0];

  theme.subscribe((value: themeType) => {
    localforage.setItem("theme", value).catch(console.warn);
  });

  transaction.subscribe(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    debounce((tx: Transaction) => {
      localforage.setItem("doc", tx.doc.toJSON()).catch(console.warn);
    }, 1000),
  );
};

export const getDocumentFromStorage = async (): Promise<Node | undefined> => {
  const node = await localforage.getItem("doc");
  return node === null ? undefined : Node.fromJSON(schema, node);
};

export const getPathfromStorage = async () =>
  await localforage.getItem<string | null>("path");
