import type { PagePointer } from "../editor/pagePointer";

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
