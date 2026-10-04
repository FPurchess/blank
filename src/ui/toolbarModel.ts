import { separated } from "../separated";
import type { ToolbarItem } from "../state";

// what a toolbar shows in a row: a button, or a separator between groups
export type ToolbarEntry<T extends ToolbarItem & { group: string }> =
  { key: string; item: T } | { key: string; item: null };

/**
 * toolbarEntries returns the buttons of `items` in their groups, keyed by the
 * item, so a button stays the same element while the toolbar updates
 */
export const toolbarEntries = <T extends ToolbarItem & { group: string }>(
  items: readonly T[],
): ToolbarEntry<T>[] =>
  separated(items, null).map((item, index) =>
    item ? { key: item.id, item } : { key: `separator-${index}`, item: null },
  );

/**
 * keepFocus keeps the focus where it is, in the editor, when a bar or a
 * toolbar is pressed, except in its fields
 */
export const keepFocus = (event: MouseEvent) => {
  if (!(event.target as Element).closest("input, textarea")) {
    event.preventDefault();
  }
};
