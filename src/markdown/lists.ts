import type { Node } from "prosemirror-model";

// The markers of lists, the same on the pages, in the PDF and in Word.

// the bullets of a bullet list, by its depth
export const BULLETS = ["•", "◦", "▪"];

/**
 * listStart returns the number an ordered list starts at
 */
export const listStart = (list: Node) =>
  (list.attrs.order as number | undefined) ?? 1;

/**
 * listMarker returns the marker of the item at `index` in `list`: its number,
 * "3.", or a bullet by the list's depth
 */
export const listMarker = (list: Node, index: number, depth: number) =>
  list.type.name === "ordered_list"
    ? `${listStart(list) + index}.`
    : BULLETS[depth % BULLETS.length];
