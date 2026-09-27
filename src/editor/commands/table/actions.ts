import type { Command, EditorState } from "prosemirror-state";
import { isInTable, selectedRect } from "prosemirror-tables";
import type { EditorView } from "prosemirror-view";

import type { Alignment } from "../../../markdown";
import { language } from "../../../state";
import { isMac } from "../../plugins/openLink";
import {
  alignColumns,
  canMerge,
  hasHeaderRow,
  mergeOrSplit,
  setCaption,
  toggleHeaderColumn,
  toggleHeaderRow,
} from "./format";
import { addColumns, addRows } from "./insert";
import { moveColumns, moveRows } from "./move";
import { cellsOfColumns, hasHeaderColumn } from "./rect";
import { deleteColumns, deleteRows, deleteTable } from "./remove";
import { sortByColumn, sortColumn, sortOrder } from "./sort";

// Everything that can be done to a table, in one list: the table toolbar
// shows it as buttons, table mode (Mod+T in a table) as keys, and the context
// menu as its Table submenu.

// the key that runs an action in table mode. Letters are matched by their
// position (`code`), so they work with every keyboard layout.
export interface ActionKey {
  code: string;
  shift?: boolean;
  mod?: boolean;
  // how the key is shown, e.g. "↑" or "L"
  label: string;
}

export type ActionGroup =
  "rows" | "columns" | "move" | "align" | "content" | "table";

export interface TableAction {
  id: string;
  group: ActionGroup;
  // what the action does, for the menu, tooltips and screen readers
  label: (state: EditorState) => string;
  // the name of the icon in src/icons.ts
  icon: string;
  key: ActionKey;
  // whether the toolbar shows a button for it; moving rows and columns is
  // done by dragging there
  toolbar: boolean;
  // whether it applies to the selection now
  enabled: (state: EditorState) => boolean;
  // whether it's switched on, for header rows and columns and alignment
  checked?: (state: EditorState) => boolean;
  // what it did, announced to screen readers and in the status bar; asked
  // before it runs
  done: (state: EditorState) => string;
  run: (view: EditorView) => void;
}

/**
 * count describes `n` things, e.g. "a row" or "3 rows"
 */
const count = (n: number, one: string, many: string) =>
  n === 1 ? `a ${one}` : `${n} ${many}`;

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

// how many rows and columns are selected
const rows = (state: EditorState) => {
  const { top, bottom } = selectedRect(state);
  return bottom - top;
};
const columns = (state: EditorState) => {
  const { left, right } = selectedRect(state);
  return right - left;
};

/**
 * commandAction makes an action of `command`: it applies when the command
 * does, and runs it
 */
const commandAction = (
  command: Command,
  action: Omit<TableAction, "enabled" | "run">,
): TableAction => ({
  ...action,
  enabled: (state) => isInTable(state) && command(state),
  run: (view) => command(view.state, view.dispatch, view),
});

/**
 * aligned tells whether all cells of the selected columns are aligned `align`
 */
const aligned = (align: Alignment) => (state: EditorState) => {
  if (!isInTable(state)) return false;
  const rect = selectedRect(state);
  return cellsOfColumns(rect, rect.left, rect.right).every(
    (pos) => state.doc.nodeAt(pos)!.attrs.align === align,
  );
};

// how each alignment is named in the label and the announcement
const ALIGNMENTS: Record<Alignment, { label: string; done: string }> = {
  left: { label: "Align left", done: "aligned left" },
  center: { label: "Center", done: "centered" },
  right: { label: "Align right", done: "aligned right" },
};

const alignAction = (align: Alignment, code: string) =>
  commandAction(alignColumns(align), {
    id: `align-${align}`,
    group: "align",
    label: () => ALIGNMENTS[align].label,
    icon: `align-${align}`,
    key: { code, label: code.slice(-1) },
    toolbar: true,
    checked: aligned(align),
    done: (state) =>
      aligned(align)(state)
        ? "Alignment reset"
        : `${capitalize(count(columns(state), "column", "columns"))} ${ALIGNMENTS[align].done}`,
  });

/**
 * sortedBy describes what sorting by the selected column does
 */
const sortedBy = (state: EditorState) => {
  const rect = selectedRect(state);
  const { body, values } = sortColumn(rect)!;
  const { descending } = sortOrder(values, language.value);
  const header = body
    ? rect.table.nodeAt(rect.map.map[rect.left])!.textContent.trim()
    : "";
  const name = header || `column ${rect.left + 1}`;
  return `Sorted by ${name}, ${descending ? "descending" : "ascending"}`;
};

/**
 * tableActions returns the actions on tables. `editCaption` opens the field
 * for the caption of the table at the selection.
 */
export const tableActions = (
  editCaption: (view: EditorView) => void,
): TableAction[] => [
  commandAction(addRows("above"), {
    id: "row-above",
    group: "rows",
    label: () => "Insert row above",
    icon: "row-above",
    key: { code: "ArrowUp", label: "↑" },
    toolbar: true,
    done: (state) => `${capitalize(count(rows(state), "row", "rows"))} added`,
  }),
  commandAction(addRows("below"), {
    id: "row-below",
    group: "rows",
    label: () => "Insert row below",
    icon: "row-below",
    key: { code: "ArrowDown", label: "↓" },
    toolbar: true,
    done: (state) => `${capitalize(count(rows(state), "row", "rows"))} added`,
  }),
  commandAction(deleteRows, {
    id: "row-delete",
    group: "rows",
    label: (state) => (rows(state) > 1 ? "Delete rows" : "Delete row"),
    icon: "row-delete",
    key: { code: "Backspace", label: "⌫" },
    toolbar: true,
    done: (state) => `${capitalize(count(rows(state), "row", "rows"))} deleted`,
  }),
  commandAction(addColumns("left"), {
    id: "column-left",
    group: "columns",
    label: () => "Insert column left",
    icon: "column-left",
    key: { code: "ArrowLeft", label: "←" },
    toolbar: true,
    done: (state) =>
      `${capitalize(count(columns(state), "column", "columns"))} added`,
  }),
  commandAction(addColumns("right"), {
    id: "column-right",
    group: "columns",
    label: () => "Insert column right",
    icon: "column-right",
    key: { code: "ArrowRight", label: "→" },
    toolbar: true,
    done: (state) =>
      `${capitalize(count(columns(state), "column", "columns"))} added`,
  }),
  commandAction(deleteColumns, {
    id: "column-delete",
    group: "columns",
    label: (state) => (columns(state) > 1 ? "Delete columns" : "Delete column"),
    icon: "column-delete",
    key: { code: "Backspace", shift: true, label: "⇧⌫" },
    toolbar: true,
    done: (state) =>
      `${capitalize(count(columns(state), "column", "columns"))} deleted`,
  }),
  commandAction(moveRows(-1), {
    id: "row-up",
    group: "move",
    label: () => "Move row up",
    icon: "row-up",
    key: { code: "ArrowUp", shift: true, label: "⇧↑" },
    toolbar: false,
    done: () => "Moved up",
  }),
  commandAction(moveRows(1), {
    id: "row-down",
    group: "move",
    label: () => "Move row down",
    icon: "row-down",
    key: { code: "ArrowDown", shift: true, label: "⇧↓" },
    toolbar: false,
    done: () => "Moved down",
  }),
  commandAction(moveColumns(-1), {
    id: "column-back",
    group: "move",
    label: () => "Move column left",
    icon: "column-back",
    key: { code: "ArrowLeft", shift: true, label: "⇧←" },
    toolbar: false,
    done: () => "Moved left",
  }),
  commandAction(moveColumns(1), {
    id: "column-forward",
    group: "move",
    label: () => "Move column right",
    icon: "column-forward",
    key: { code: "ArrowRight", shift: true, label: "⇧→" },
    toolbar: false,
    done: () => "Moved right",
  }),
  alignAction("left", "KeyL"),
  alignAction("center", "KeyC"),
  alignAction("right", "KeyR"),
  commandAction(sortByColumn, {
    id: "sort",
    group: "content",
    label: () => "Sort by this column",
    icon: "sort",
    key: { code: "KeyS", label: "S" },
    toolbar: true,
    done: sortedBy,
  }),
  commandAction(mergeOrSplit, {
    id: "merge",
    group: "content",
    label: (state) => (canMerge(state) ? "Merge cells" : "Split cell"),
    icon: "merge",
    key: { code: "KeyM", label: "M" },
    toolbar: true,
    done: (state) => (canMerge(state) ? "Cells merged" : "Cell split"),
  }),
  commandAction(toggleHeaderRow, {
    id: "header-row",
    group: "table",
    label: () => "Header row",
    icon: "header-row",
    key: { code: "KeyH", label: "H" },
    toolbar: true,
    checked: (state) => isInTable(state) && hasHeaderRow(selectedRect(state)),
    done: (state) =>
      hasHeaderRow(selectedRect(state)) ? "Header row off" : "Header row on",
  }),
  commandAction(toggleHeaderColumn, {
    id: "header-column",
    group: "table",
    label: () => "Header column",
    icon: "header-column",
    key: { code: "KeyH", shift: true, label: "⇧H" },
    toolbar: true,
    checked: (state) =>
      isInTable(state) && hasHeaderColumn(selectedRect(state)),
    done: (state) =>
      hasHeaderColumn(selectedRect(state))
        ? "Header column off"
        : "Header column on",
  }),
  {
    id: "caption",
    group: "table",
    label: () => "Caption…",
    icon: "caption",
    key: { code: "KeyT", label: "T" },
    toolbar: true,
    enabled: (state) => isInTable(state) && setCaption("")(state),
    done: () => "",
    run: editCaption,
  },
  commandAction(deleteTable, {
    id: "table-delete",
    group: "table",
    label: () => "Delete table",
    icon: "table-delete",
    key: { code: "Backspace", mod: true, label: isMac() ? "⌘⌫" : "Ctrl ⌫" },
    toolbar: true,
    done: () => "Table deleted",
  }),
];

/**
 * matchesKey tells whether `event` is the key of `action`
 */
export const matchesKey = (action: TableAction, event: KeyboardEvent) =>
  event.code === action.key.code &&
  event.shiftKey === !!action.key.shift &&
  (event.ctrlKey || event.metaKey) === !!action.key.mod &&
  !event.altKey;
