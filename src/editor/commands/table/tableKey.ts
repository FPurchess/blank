import type { Command } from "prosemirror-state";
import { isInTable } from "prosemirror-tables";

import { tablePicker } from "../../../state";
import { DEFAULT_SIZE } from "../../../tablePicker";
import { toolsKey } from "../../plugins/tables/tools";
import { insertTable } from "./insert";

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
  if (!insertTable(DEFAULT_SIZE.cols, DEFAULT_SIZE.rows)(state)) return false;
  if (!dispatch || !view) return true;

  const coords = view.coordsAtPos(state.selection.head);
  const close = () => {
    tablePicker.value = null;
    view.focus();
  };
  tablePicker.value = {
    ...DEFAULT_SIZE,
    anchor: { left: coords.left, top: coords.top, bottom: coords.bottom },
    submit: (cols, rows) => {
      close();
      insertTable(cols, rows)(view.state, view.dispatch);
    },
    cancel: close,
  };
  return true;
};
