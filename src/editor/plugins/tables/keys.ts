import { keydownHandler } from "prosemirror-keymap";
import type { ResolvedPos } from "prosemirror-model";
import {
  Plugin,
  Selection,
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state";
import { liftListItem, sinkListItem } from "prosemirror-schema-list";
import {
  CellSelection,
  deleteCellSelection,
  goToNextCell,
  isInTable,
  selectedRect,
} from "prosemirror-tables";

import { schema } from "../../../markdown";
import { addRows } from "../../commands/table/insert";
import { cellPos, refreshed, transactionOf } from "../../commands/table/rect";
import { removeTable } from "../../commands/table/remove";
import {
  cellDepth,
  isEmptyTable,
  keepsParagraphAfter,
  plainCell,
  tableAround,
  textblockRange,
  type TableAt,
} from "./util";

type Direction = "up" | "down" | "left" | "right";

/**
 * listItemStart returns the depth of the list item whose first line starts
 * at `$pos`, or -1
 */
const listItemStart = ($pos: ResolvedPos): number => {
  if ($pos.parentOffset !== 0 || $pos.depth < 2) return -1;
  const item = $pos.node(-1);
  if (item.type !== schema.nodes.list_item || $pos.index(-1) !== 0) return -1;
  return $pos.depth - 1;
};

/**
 * tab moves to the next (`dir` 1) or previous (-1) cell, adding a row after
 * the last cell. At the start of a list item it indents or outdents instead.
 */
const tab =
  (dir: 1 | -1): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false;
    const { selection } = state;
    // isInTable means the list item is in a cell
    const item = selection.empty ? listItemStart(selection.$from) : -1;
    if (item > 0) {
      const itemType = schema.nodes.list_item;
      if (dir === 1 && sinkListItem(itemType)(state, dispatch)) return true;
      // only nested items are outdented, the others stay in their list
      const nested =
        item >= 2 && selection.$from.node(item - 2).type === itemType;
      if (dir === -1 && nested && liftListItem(itemType)(state, dispatch)) {
        return true;
      }
    }
    if (goToNextCell(dir)(state, dispatch)) return true;
    // in the first cell, Shift+Tab stays put
    if (dir === -1) return true;
    // after the last cell, a new row with the cursor at its start
    const added = transactionOf(addRows("below"), state);
    if (!added) return false;
    if (dispatch) {
      const rect = refreshed(added, selectedRect(state));
      const start = cellPos(rect, rect.map.height - 1, 0);
      dispatch(
        added.setSelection(TextSelection.near(added.doc.resolve(start + 1))),
      );
    }
    return true;
  };

/**
 * enter inserts a line break in plain cell text, which keeps a pipe table a
 * pipe table. On an empty line after a line break, it starts a new paragraph
 * instead. Lists, quotes and code blocks in cells handle Enter as usual.
 */
const enter: Command = (state, dispatch) => {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;
  const { $from, $to } = selection;
  if (!plainCell($from) || $from.parent !== $to.parent) return false;

  const before = selection.empty ? $from.nodeBefore : null;
  const after = selection.empty ? $from.nodeAfter : null;
  const { hard_break } = schema.nodes;
  const emptyLine =
    before?.type === hard_break && (!after || after.type === hard_break);
  if (dispatch) {
    const tr = state.tr;
    if (emptyLine) {
      const at = $from.pos - 1;
      tr.delete(at, $from.pos).split(at);
      // the new paragraph opens right after the split
      tr.setSelection(TextSelection.create(tr.doc, at + 2));
    } else {
      tr.replaceSelectionWith(hard_break.create());
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * leave puts the cursor just outside `table`, after it if `forward`, adding
 * a paragraph if the cursor would have nowhere to go
 */
const leave = (
  state: EditorState,
  table: TableAt,
  forward: boolean,
): Transaction => {
  const tr = state.tr;
  const pos = forward ? table.pos + table.node.nodeSize : table.pos;
  const $pos = tr.doc.resolve(pos);
  const neighbor = forward ? $pos.nodeAfter : $pos.nodeBefore;
  const found =
    neighbor && neighbor.type !== schema.nodes.table && !neighbor.isAtom
      ? Selection.findFrom($pos, forward ? 1 : -1, true)
      : null;
  if (found) return tr.setSelection(found).scrollIntoView();
  tr.insert(pos, schema.nodes.paragraph.create());
  return tr
    .setSelection(TextSelection.create(tr.doc, pos + 1))
    .scrollIntoView();
};

/**
 * leaveTable moves the cursor out of the table when an arrow key in
 * `direction` is pressed at its edge: down or right from the end of the last
 * row, up or left from the start of the first
 */
const leaveTable =
  (direction: Direction): Command =>
  (state, dispatch, view) => {
    const { selection } = state;
    if (!(selection instanceof TextSelection) || !selection.empty) return false;
    const $head = selection.$head;
    const depth = cellDepth($head);
    const table = tableAround($head);
    if (depth < 0 || !table) return false;

    const rect = table.map.findCell($head.before(depth) - table.start);
    const forward = direction === "down" || direction === "right";
    const atEdge = {
      down: rect.bottom === table.map.height,
      up: rect.top === 0,
      right: rect.bottom === table.map.height && rect.right === table.map.width,
      left: rect.top === 0 && rect.left === 0,
    }[direction];
    if (!atEdge) return false;

    // the cursor has to be in the cell's last (first) line
    const range = textblockRange($head.node(depth), $head.start(depth));
    const inEdgeBlock = forward
      ? range?.to === $head.end()
      : range?.from === $head.start();
    if (!inEdgeBlock || !view?.endOfTextblock(direction)) return false;

    if (dispatch) dispatch(leave(state, table, forward));
    return true;
  };

/**
 * clearCells clears the selected cells, and removes the table only when all
 * of it is selected: removing rows or columns is always asked for explicitly
 */
const clearCells: Command = (state, dispatch) => {
  const { selection } = state;
  if (!(selection instanceof CellSelection)) return false;
  if (selection.isRowSelection() && selection.isColSelection()) {
    if (dispatch) dispatch(removeTable(state, selectedRect(state)));
    return true;
  }
  return deleteCellSelection(state, dispatch);
};

/**
 * backspace removes a table that is still empty from its first cell, and
 * moves from the empty line after a table into its last cell
 */
const backspace: Command = (state, dispatch) => {
  const { $cursor } = state.selection as TextSelection;
  if (!$cursor || $cursor.parentOffset !== 0) return false;

  const table = tableAround($cursor);
  if (table) {
    const range = textblockRange(table.node, table.start);
    if (range?.from !== $cursor.pos || !isEmptyTable(table.node)) return false;
    if (dispatch) dispatch(removeTable(state, selectedRect(state)));
    return true;
  }

  // an empty paragraph right after a table
  const { parent } = $cursor;
  if (parent.type !== schema.nodes.paragraph || parent.content.size > 0) {
    return false;
  }
  const container = $cursor.node(-1);
  const index = $cursor.index(-1);
  if (index === 0 || container.child(index - 1).type !== schema.nodes.table) {
    return false;
  }
  if (dispatch) {
    const tr = state.tr;
    // the paragraph stays where Blank keeps one: at the end or between tables
    if (!keepsParagraphAfter(container, index)) {
      tr.delete($cursor.before(), $cursor.after());
    }
    const tableEnd = $cursor.before() - 1;
    tr.setSelection(Selection.near(tr.doc.resolve(tableEnd), -1));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * selectAll selects the content of the cell, then the whole table, then
 * lets the document be selected
 */
const selectAll: Command = (state, dispatch) => {
  const { selection } = state;
  const table = tableAround(selection.$head);
  if (!table) return false;
  const { map, start } = table;
  const whole = CellSelection.create(
    state.doc,
    start + map.map[0],
    start + map.map[map.map.length - 1],
  );

  if (selection instanceof CellSelection) {
    if (selection.isRowSelection() && selection.isColSelection()) return false;
    if (dispatch) dispatch(state.tr.setSelection(whole));
    return true;
  }
  const depth = cellDepth(selection.$head);
  const range = textblockRange(
    selection.$head.node(depth),
    selection.$head.start(depth),
  );
  const content =
    range && TextSelection.create(state.doc, range.from, range.to);
  const next =
    content && !(selection.from === content.from && selection.to === content.to)
      ? content
      : whole;
  if (dispatch) dispatch(state.tr.setSelection(next));
  return true;
};

/**
 * tableKeys handles Tab, Enter, arrows, Backspace and Mod+A in tables
 */
export const tableKeys = () =>
  new Plugin({
    props: {
      handleKeyDown: keydownHandler({
        Tab: tab(1),
        "Shift-Tab": tab(-1),
        Enter: enter,
        ArrowDown: leaveTable("down"),
        ArrowUp: leaveTable("up"),
        ArrowRight: leaveTable("right"),
        ArrowLeft: leaveTable("left"),
        Backspace: (state, dispatch, view) =>
          clearCells(state, dispatch, view) || backspace(state, dispatch, view),
        Delete: clearCells,
        "Mod-Backspace": clearCells,
        "Mod-Delete": clearCells,
        "Mod-a": selectAll,
      }),
    },
  });
