import type { Node, ResolvedPos } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  Selection,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import { canJoin } from "prosemirror-transform";
import { liftListItem } from "prosemirror-schema-list";

import { schema } from "../../markdown";

// Enter and Backspace in lists, as Google Docs and Notion have them: Enter
// on an empty item takes it up a level, out of the list at the top, and
// Backspace at the start of an item deletes it when it's empty, and takes
// it up a level when it isn't; at the start of the paragraph after a list,
// it joins the paragraph to the list's last line.

export const isList = (node: Node) =>
  node.type === schema.nodes.bullet_list ||
  node.type === schema.nodes.ordered_list;

/**
 * listItemStart returns the depth of the list item whose first line starts
 * at `$pos`, or -1
 */
export const listItemStart = ($pos: ResolvedPos): number => {
  if ($pos.parentOffset !== 0 || $pos.depth < 2) return -1;
  const item = $pos.node(-1);
  if (item.type !== schema.nodes.list_item || $pos.index(-1) !== 0) return -1;
  return $pos.depth - 1;
};

// the depth of the list item a cursor at the start of its first line is in,
// unless that line is code, whose own keys work in it; or -1
const itemAtStart = (state: EditorState) => {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return -1;
  const { $from } = selection;
  if ($from.parent.type.spec.code) return -1;
  return listItemStart($from);
};

// whether the item at `depth` holds nothing but its empty first line
const isEmptyItem = ($pos: ResolvedPos, depth: number) =>
  $pos.node(depth).childCount === 1 && $pos.parent.content.size === 0;

// the transaction `command` makes, or null where it does nothing
const transactionOf = (command: Command, state: EditorState) => {
  let made: Transaction | null = null;
  command(state, (tr) => {
    made = tr;
  });
  return made as Transaction | null;
};

/**
 * restartAfter numbers the second part of a numbered list split by the
 * paragraph the selection is in from 1 again, as a new list
 */
const restartAfter = (tr: Transaction) => {
  const { $from } = tr.selection;
  if ($from.depth < 1) return tr;
  const container = $from.node(-1);
  const index = $from.index(-1);
  const before = container.maybeChild(index - 1);
  const after = container.maybeChild(index + 1);
  const ordered = schema.nodes.ordered_list;
  if (before?.type === ordered && after?.type === ordered) {
    if (after.attrs.order !== 1) {
      tr.setNodeAttribute($from.after(), "order", 1);
    }
  }
  return tr;
};

// takes the item the cursor is in up a level: into the list around its
// own, or out of the list at the top
const liftItem: Command = (state, dispatch) => {
  const tr = transactionOf(liftListItem(schema.nodes.list_item), state);
  if (!tr) return false;
  dispatch?.(restartAfter(tr).scrollIntoView());
  return true;
};

/**
 * enterEmptyItem takes an empty list item out of its list on Enter, and out
 * of the lists around it when it's nested, so Enter twice at the end of an
 * item always leaves the list; Shift-Tab takes an item out a level only.
 * In the middle of a list, that splits it there, and the items after it in
 * a nested list stay a list of their own below the new paragraph.
 */
export const enterEmptyItem: Command = (state, dispatch) => {
  const depth = itemAtStart(state);
  if (depth < 0 || !isEmptyItem(state.selection.$from, depth)) return false;
  if (dispatch) {
    // a level at a time, as liftListItem goes, in one transaction
    const tr = state.tr;
    let current = state;
    while (itemAtStart(current) >= 0) {
      const lifted = transactionOf(
        liftListItem(schema.nodes.list_item),
        current,
      );
      if (!lifted) break;
      for (const step of lifted.steps) tr.step(step);
      current = current.apply(lifted);
    }
    tr.setSelection(TextSelection.create(tr.doc, current.selection.from));
    dispatch(restartAfter(tr).scrollIntoView());
  }
  return true;
};

/**
 * backspaceInList handles Backspace at the start of a list item: an empty
 * one is deleted and the cursor goes to the end of the line above, unless
 * it's the first item of a list at the top, which becomes a paragraph; one
 * with text goes up a level, and out of the list at the top
 */
export const backspaceInList: Command = (state, dispatch) => {
  const depth = itemAtStart(state);
  if (depth < 0) return false;
  const { $from } = state.selection;
  const nested =
    depth >= 3 && $from.node(depth - 2).type === schema.nodes.list_item;
  const first = $from.index(depth - 1) === 0;
  if (!isEmptyItem($from, depth) || (first && !nested)) {
    return liftItem(state, dispatch);
  }
  if (dispatch) {
    // an only item goes with its list
    const list = $from.node(depth - 1);
    const gone = list.childCount === 1 ? depth - 1 : depth;
    const from = $from.before(gone);
    const tr = state.tr.delete(from, $from.after(gone));
    tr.setSelection(Selection.near(tr.doc.resolve(from), -1));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * joinAfterList handles Backspace at the start of a paragraph right after a
 * list: its text joins the list's last line, and an empty one goes. A list
 * of the same kind after it then joins the list, which closes again what
 * taking an item out of it split.
 */
export const joinAfterList: Command = (state, dispatch) => {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  if ($from.parentOffset !== 0 || $from.parent.type !== schema.nodes.paragraph)
    return false;
  const index = $from.index(-1);
  const list = $from.node(-1).maybeChild(index - 1);
  if (!list || !isList(list)) return false;
  const listEnd = $from.before();
  const listStart = listEnd - list.nodeSize;
  // the list's last line, unless it isn't an item's text, e.g. code or a
  // table's cell
  const end = Selection.near(state.doc.resolve(listEnd), -1);
  const { $head } = end;
  const textual =
    end instanceof TextSelection &&
    $head.pos > listStart &&
    $head.node(-1).type === schema.nodes.list_item &&
    ($head.parent.type === schema.nodes.paragraph ||
      $head.parent.type === schema.nodes.heading);
  if (!textual) return false;
  if (dispatch) {
    const paragraph = $from.parent;
    const tr = state.tr.delete(listEnd, $from.after());
    tr.insert($head.pos, paragraph.content);
    tr.setSelection(TextSelection.create(tr.doc, $head.pos));
    const joined = listStart + tr.doc.nodeAt(listStart)!.nodeSize;
    const next = tr.doc.resolve(joined).nodeAfter;
    if (next?.type === list.type && canJoin(tr.doc, joined)) tr.join(joined);
    dispatch(tr.scrollIntoView());
  }
  return true;
};
