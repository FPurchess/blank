import { CommandIdentifier } from "../config";
import { commandShortcut } from "../editor/keyBindings";
import type { ToolbarItem } from "../state";

export { type ToolbarEntry, toolbarEntries } from "./toolbarModel";

/**
 * itemLabel labels the button of `item`, with its key in table mode
 */
export const itemLabel = (item: ToolbarItem, keys: boolean) =>
  keys && item.key ? `${item.label} (${item.key})` : item.label;

/**
 * tableModeHint explains the keys of table mode
 */
export const tableModeHint = () =>
  `Shift+arrows move rows and columns · Esc or ${commandShortcut(
    CommandIdentifier.INSERT_TABLE,
  )}: done`;
