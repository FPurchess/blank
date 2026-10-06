import type { Node } from "prosemirror-model";
import { closeHistory } from "prosemirror-history";
import {
  type Command,
  EditorState,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import { liftListItem, sinkListItem } from "prosemirror-schema-list";

import { schema } from "../../markdown";
import { isList } from "./listKeys";

// Tab and Shift-Tab outside code, as VS Code has them: in a list they take
// the items a level down or up. In text, Tab puts a tab at the cursor, or in
// place of what's selected on one line; over several lines, or a whole one,
// it puts one in front of each, and Shift-Tab takes one away from each,
// wherever the cursor is. Markdown keeps no other indentation of a
// paragraph, and a tab reaches the next tab stop on the page.

const itemType = schema.nodes.list_item;
const TAB = "\t";
const sinking = sinkListItem(itemType);
const lifting = liftListItem(itemType);

// whether a textblock takes tabs: code has its own keys
const takesTabs = (node: Node) =>
  node.type === schema.nodes.paragraph || node.type === schema.nodes.heading;

// the items of one list the selection is in, as prosemirror-schema-list
// finds them
const listRange = (state: EditorState) => {
  const { $from, $to } = state.selection;
  return $from.blockRange(
    $to,
    (node) => node.childCount > 0 && node.firstChild!.type === itemType,
  );
};

/**
 * sinkItems takes the list items the selection is in a level down, where
 * they can go: not the first item of a list
 */
export const sinkItems: Command = (state, dispatch) =>
  !!listRange(state) && sinking(state, dispatch);

/**
 * liftItems takes the list items the selection is in a level up, out of the
 * list at the top
 */
export const liftItems: Command = (state, dispatch) =>
  !!listRange(state) && lifting(state, dispatch);

/**
 * inItems makes `command` keep a key the selection in a list's items gets,
 * even where it does nothing, e.g. Tab on a list's first item: a tab is no
 * text a list item takes, and the focus stays in the editor
 */
export const inItems =
  (command: Command): Command =>
  (state, dispatch, view) =>
    !!listRange(state) && (command(state, dispatch, view) || true);

/**
 * insertTab puts a tab at the cursor, or in place of a selection on one line
 * of text; a whole line selected is indented instead (see indentLines)
 */
export const insertTab: Command = (state, dispatch) => {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;
  const { $from, $to } = selection;
  if (!$from.sameParent($to) || !takesTabs($from.parent)) return false;
  const whole =
    !selection.empty &&
    $from.parentOffset === 0 &&
    $to.parentOffset === $from.parent.content.size;
  if (whole) return false;
  dispatch?.(state.tr.insertText(TAB, selection.from, selection.to));
  return true;
};

// a textblock or list the selection touches, at its position
interface Touched {
  node: Node;
  pos: number;
}

/**
 * touched returns the textblocks that take tabs and the lists the selection
 * touches, outside the lists, in the order of the document. A selection
 * that ends at the start of a block leaves that block alone, as VS Code
 * leaves the line.
 */
const touched = (state: EditorState): Touched[] => {
  const { $from, $to, from } = state.selection;
  let to = state.selection.to;
  if (!$from.sameParent($to) && $to.parentOffset === 0) to -= 1;
  const found: Touched[] = [];
  state.doc.nodesBetween(from, Math.max(from, to), (node, pos) => {
    if (isList(node)) {
      found.push({ node, pos });
      return false;
    }
    if (node.isTextblock) {
      if (takesTabs(node)) found.push({ node, pos });
      return false;
    }
    return true;
  });
  return found;
};

/**
 * shiftItems runs `command` (sinkListItem or liftListItem) on the items of
 * the list at `pos` in `tr.doc` that the selection touched, from `from` to
 * `to`, and adds its steps to `tr`
 */
const shiftItems = (
  tr: Transaction,
  pos: number,
  from: number,
  to: number,
  command: Command,
) => {
  const list = tr.doc.nodeAt(pos)!;
  let start = Math.max(from, pos + 1);
  const end = Math.min(to, pos + list.nodeSize - 1);
  // the first item has none before it to go into, but the others can
  const second = pos + 1 + list.firstChild!.nodeSize;
  if (start < second && command === sinking) start = second + 1;
  if (start > end) return;
  const $start = tr.doc.resolve(start);
  const $end = tr.doc.resolve(end);
  const selection = TextSelection.between($start, $end);
  const state = EditorState.create({ doc: tr.doc, selection });
  command(state, (made) => {
    for (const step of made.steps) tr.step(step);
  });
};

/**
 * shiftLines puts a tab in front of every line of text the selection
 * touches (`direction` 1) or takes one away from each (-1), and takes the
 * list items it touches a level down or up. It does nothing where nothing
 * changes.
 */
const shiftLines =
  (direction: 1 | -1): Command =>
  (state, dispatch) => {
    if (!(state.selection instanceof TextSelection)) return false;
    const { from, to } = state.selection;
    const blocks = touched(state);
    const tr = state.tr;
    const listCommand = direction === 1 ? sinking : lifting;
    // from the last one up, so the earlier positions stay as they are
    for (const { node, pos } of [...blocks].reverse()) {
      if (isList(node)) {
        shiftItems(tr, pos, from, tr.mapping.map(to), listCommand);
      } else if (direction === 1) {
        tr.insertText(TAB, pos + 1);
      } else if (node.textContent.startsWith(TAB)) {
        tr.delete(pos + 1, pos + 2);
      }
    }
    if (!tr.docChanged) return false;
    if (dispatch) {
      // on the same lines, the tabs in front of them included
      const { anchor, head } = state.selection;
      const forward = anchor <= head;
      const map = (pos: number, side: -1 | 1) => tr.mapping.map(pos, side);
      tr.setSelection(
        TextSelection.create(
          tr.doc,
          map(anchor, forward ? -1 : 1),
          map(head, forward ? 1 : -1),
        ),
      );
      // a step of its own in the history, however quickly the keys come
      dispatch(closeHistory(tr).scrollIntoView());
    }
    return true;
  };

// a tab in front of each line of text the selection touches
export const indentLines: Command = shiftLines(1);
// a tab less in front of each line of text the selection touches
export const outdentLines: Command = shiftLines(-1);

/**
 * keepKey keeps a key in the editor where nothing else took it, so Tab and
 * Shift-Tab never move the focus out of the text; F6 does that
 */
export const keepKey: Command = () => true;
