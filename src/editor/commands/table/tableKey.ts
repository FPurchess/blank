import type { Command } from "prosemirror-state";
import { isInTable } from "prosemirror-tables";

import { caretBox } from "../../../engine/geometry";
import { type Anchor, tablePicker } from "../../../state";
import { DEFAULT_SIZE } from "./pickerSize";
import { toolsKey } from "../../plugins/tables/tools";
import { insertTable } from "./insert";
import { headAfter } from "../../plugins/pageView";

/**
 * openTablePicker opens the picker for the size of a new table, below
 * `anchor` (the caret where none is given), outside a table only
 */
export const openTablePicker =
  (anchor?: Anchor): Command =>
  (state, dispatch, view) => {
    if (isInTable(state)) return false;
    if (!insertTable(DEFAULT_SIZE.cols, DEFAULT_SIZE.rows)(state)) return false;
    if (!dispatch || !view) return true;
    const caret = anchor
      ? null
      : caretBox(state.selection.head, headAfter(state));
    const at =
      anchor ??
      (caret
        ? { left: caret.left, top: caret.top, bottom: caret.bottom }
        : { left: 0, top: 0, bottom: 0 });
    const close = () => {
      tablePicker.value = null;
      view.focus();
    };
    tablePicker.value = {
      ...DEFAULT_SIZE,
      anchor: at,
      submit: (cols, rows) => {
        close();
        insertTable(cols, rows)(view.state, view.dispatch);
      },
      cancel: close,
    };
    return true;
  };

/**
 * tableKey is the one key for tables: outside a table it opens the picker
 * for the size of a new table, inside one it switches table mode on, in which
 * the toolbar's actions run from the keyboard
 */
export const tableKey = (): Command => (state, dispatch, view) => {
  if (tablePicker.value) {
    tablePicker.value.cancel();
    return true;
  }
  if (isInTable(state)) {
    const keys = !toolsKey.getState(state)?.keys;
    dispatch?.(state.tr.setMeta(toolsKey, { keys }));
    return true;
  }
  return openTablePicker()(state, dispatch, view);
};
