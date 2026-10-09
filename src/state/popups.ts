import { shallowRef } from "vue";

import type { CommandIdentifier } from "../config";
import type { ThemeName } from "./appearance";

// where a popup like a menu is shown: below the cursor, in viewport coordinates
export interface Anchor {
  left: number;
  top: number;
  bottom: number;
  // its right end, which a popup lines up with when it opens at the end
  right?: number;
}

// a box something sits on, e.g. a table or a block its toolbar is above
export type BoxAnchor = Required<Anchor>;

export interface TablePickerState {
  // the size of the table Enter inserts, the header row included
  cols: number;
  rows: number;
  // where to show the picker
  anchor: Anchor;
  // inserts a table of the given size
  submit(cols: number, rows: number): void;
  // closes the picker without inserting a table
  cancel(): void;
}

// tablePicker is the open picker for the size of a new table, or null
export const tablePicker = shallowRef<TablePickerState | null>(null);

// a button of a toolbar
export interface ToolbarItem {
  id: string;
  label: string;
  // what its tooltip says, where that isn't its label
  tip?: string;
  // the name of its icon, see src/icons.ts
  icon: string;
  enabled: boolean;
  // for buttons that switch something on and off
  checked?: boolean;
  // its key: shown in table mode, e.g. "↑", and on the block toolbar in
  // its tooltip
  key?: string;
  // the command it runs, whose shortcut its tooltip shows
  command?: CommandIdentifier;
  run(): void;
}

export interface TableToolbarItem extends ToolbarItem {
  key: string;
  // buttons of one group sit together
  group: string;
}

export interface TableToolbarState {
  // the box of the table, in viewport coordinates, which the toolbar sits on
  anchor: BoxAnchor;
  items: TableToolbarItem[];
  // table mode (Mod+T): the buttons show their keys, which work until Esc
  keys: boolean;
  // the caption field while it's open
  caption: {
    value: string;
    submit(value: string): void;
    cancel(): void;
  } | null;
}

// tableToolbar is the toolbar of the table the cursor is in, or null
export const tableToolbar = shallowRef<TableToolbarState | null>(null);

export interface BlockToolbarState {
  // the box of the block, in viewport coordinates, which the toolbar sits on
  anchor: BoxAnchor;
  // what the block is, e.g. "Recipe", which the toolbar shows
  label: string;
  // the icon of its kind of block, see src/icons.ts
  icon: string;
  items: ToolbarItem[];
}

// blockToolbar is the toolbar of the content block the cursor is in (a
// form) or on (a table of contents), or null
export const blockToolbar = shallowRef<BlockToolbarState | null>(null);

// a point in the window, in viewport coordinates, e.g. where the mouse is
export interface Point {
  x: number;
  y: number;
}

// a row, a column or several of them: from the first to the last (excluded)
export type Span = [from: number, to: number];

export interface TableHandlesState {
  // the box of the rows of the table under the mouse (without its caption),
  // in viewport coordinates, and the part of it in view sideways
  box: { left: number; top: number; right: number; bottom: number };
  visible: { left: number; right: number };
  // where each row and column starts, and where the last one ends. A table
  // on several pages shows the rows of the page under the mouse: `rows` are
  // those, from row `firstRow` of its `rowCount` rows on.
  rows: number[];
  firstRow: number;
  rowCount: number;
  columns: number[];
  // the header rows and header column, which rows and columns don't move
  // into and nothing is inserted before
  headerRows: number;
  headerColumn: boolean;
  // how few columns and rows dragging the table's edge leaves: empty ones
  // at its end go, others stay
  smallest: { cols: number; rows: number };
  // the width of each column in percent of the table
  percents: number[];
  // the selected rows and columns, if the selection is in this table
  selected: { rows: Span; columns: Span } | null;
  insertRow(index: number): void;
  insertColumn(index: number): void;
  // selects rows or columns and opens the table menu below `anchor`
  selectRows(rows: Span, anchor: Anchor): void;
  selectColumns(columns: Span, anchor: Anchor): void;
  moveRows(rows: Span, by: number): void;
  moveColumns(columns: Span, by: number): void;
  resize(cols: number, rows: number): void;
  // sets the column widths in percent, or null for widths by content
  setWidths(percents: number[] | null): void;
  // keeps the handles on this table while the mouse drags one
  hold(held: boolean): void;
}

// tableHandles is the table the mouse is over, whose rows and columns the
// mouse can select, insert, move and resize, or null
export const tableHandles = shallowRef<TableHandlesState | null>(null);

export type MenuItem =
  | {
      id: string;
      label: string;
      // a muted hint after the label, e.g. the first heading on a page
      detail?: string;
      // the name of an icon before the label, see src/icons.ts
      icon?: string;
      // a class that draws the item like what it makes, e.g. a heading's
      // item in a style menu
      look?: string;
      // the key binding, e.g. "Mod-z"
      shortcut?: string;
      disabled?: boolean;
      // whether it's switched on, for items that switch something on and off,
      // or with `radio` whether it's the chosen one of a set of choices
      checked?: boolean;
      radio?: boolean;
      // the items of a submenu
      children?: MenuItem[];
      run?: () => void;
      // turns the item into a text field, submitted with Enter
      edit?: { value: string; submit(value: string): void };
      // the command it runs, whose key its tooltip names
      command?: CommandIdentifier;
      // its tooltip, where its label doesn't show, e.g. on an icon of a row,
      // or why it's disabled
      tip?: string;
      // the part of the label a search matched, which shows marked
      match?: [from: number, to: number];
      // the menu stays open when it runs, e.g. a switch in the main menu,
      // which then shows the change
      stays?: boolean;
      // the theme it chooses, drawn as a swatch of that theme
      swatch?: ThemeName;
    }
  | "separator";

// the name of the section of a menu that follows, up to the next separator,
// shown above it or only read out (`shown` false)
export interface MenuHead {
  kind: "head";
  label: string;
  shown: boolean;
}

// a row of a menu that holds items side by side, after its label, e.g. the
// main menu's View with its switches: ← → move between them
export interface MenuRow {
  kind: "row";
  id: string;
  label: string;
  items: Exclude<MenuItem, "separator">[];
}

// what a level of a menu holds
export type MenuLine = MenuItem | MenuHead | MenuRow;

// a menu with a search above it, the main menu: what the search finds and
// what it says when it finds nothing
export interface MenuSearch {
  results(query: string): Exclude<MenuItem, "separator">[];
  empty(query: string): string;
}

export interface ContextMenuRequest {
  items: MenuLine[];
  // where to show the menu
  anchor: Anchor;
  // opened with the keyboard, which focuses the first item
  keyboard: boolean;
  // returns the focus to the editor
  close(): void;
  // the button that opened the menu, e.g. "Page N of M" in the bottom bar or
  // the logo, the main menu's: a press on it isn't outside the menu, so its
  // click can close the menu instead of the press closing it and the click
  // opening it again
  owner?: Element;
  // the search above the menu, which the focus starts in (the main menu)
  search?: MenuSearch;
}

// contextMenu holds the open context menu, or null while it is closed. A new
// request with the same `close` updates the open menu, e.g. once the
// suggestions are known.
export const contextMenu = shallowRef<ContextMenuRequest | null>(null);

// tooltipsSuppressed keeps the tooltips of controls (src/ui/UiTooltip.vue)
// hidden, e.g. while focus mode has faded the controls out
export const tooltipsSuppressed = shallowRef(false);

// whether the word count card shows (src/ui/WordCountCard.vue): opened by the
// pointer resting on the word count, a click on it, or the Word count command
export const wordCountCard = shallowRef(false);
