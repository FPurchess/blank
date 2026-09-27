import { CommandIdentifier, getKeyBinding } from "../config";
import { formatShortcut } from "../editor/keyBindings";
import { separated } from "../separated";
import type { TableToolbarItem } from "../state";

// what the toolbar shows in a row: a button, or a separator between groups
export type ToolbarEntry =
  { key: string; item: TableToolbarItem } | { key: string; item: null };

/**
 * toolbarEntries returns the buttons of `items` in their groups, keyed by the
 * item, so a button stays the same element while the toolbar updates
 */
export const toolbarEntries = (items: TableToolbarItem[]): ToolbarEntry[] =>
  separated(items, null).map((item, index) =>
    item ? { key: item.id, item } : { key: `separator-${index}`, item: null },
  );

/**
 * itemLabel labels the button of `item`, with its key in table mode
 */
export const itemLabel = (item: TableToolbarItem, keys: boolean) =>
  keys ? `${item.label} (${item.key})` : item.label;

/**
 * tableModeHint explains the keys of table mode
 */
export const tableModeHint = () =>
  `Shift+arrows move rows and columns · Esc or ${formatShortcut(
    getKeyBinding(CommandIdentifier.INSERT_TABLE),
  )}: done`;
