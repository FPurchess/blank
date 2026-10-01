import type { EditorView } from "prosemirror-view";

import {
  PAGE_MENU,
  PAGE_PRESS,
  type PagePointer,
  sendPagePointer,
} from "../editor/pagePointer";

/**
 * pagePointer returns what the page view tells the editor about a press at
 * `pos`, with a left button and no modifiers unless given
 */
export const pagePointer = (
  pos: number | null,
  change: Partial<PagePointer> = {},
): PagePointer => ({
  pos,
  link: null,
  x: 0,
  y: 0,
  button: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...change,
});

/**
 * pressOnPages sends a press on the pages to the editor, as the page view
 * does
 * @returns whether a plugin handled it
 */
export const pressOnPages = (
  view: EditorView,
  pos: number | null,
  change: Partial<PagePointer> = {},
) => sendPagePointer(view, PAGE_PRESS, pagePointer(pos, change));

/**
 * rightClickOnPages sends a right click on the pages to the editor
 */
export const rightClickOnPages = (
  view: EditorView,
  pos: number | null,
  change: Partial<PagePointer> = {},
) =>
  sendPagePointer(view, PAGE_MENU, pagePointer(pos, { button: 2, ...change }));
