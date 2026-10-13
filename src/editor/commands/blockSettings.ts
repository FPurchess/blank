import type { Attrs, Node } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  NodeSelection,
} from "prosemirror-state";
import type { ShallowRef } from "vue";

import type { BlockSettingsRequest } from "../../state";
import { boxOnCaretPage } from "../plugins/followLayout";
import { openBlock } from "../plugins/sourceBlocks";

// The settings of a block, below the block toolbar's settings button: a
// table of contents', a diagram's. They open on the selected block (or the
// source block whose source is open), change it at once, each change one
// undo step, and close again on the same key or button.

export interface BlockSettings<T, R extends BlockSettingsRequest<T>> {
  // the blocks they're for
  is: (node: Node) => boolean;
  // where the open settings' request is
  popover: ShallowRef<R | null>;
  // what the block has now
  values: (node: Node) => T;
  // the block's attributes with `values`
  attrs: (node: Node, values: T) => Attrs;
  // what else the request holds, e.g. what a diagram is called
  more?: (node: Node) => Omit<R, keyof BlockSettingsRequest<T>>;
}

// the block each open settings are for, by their request
const openAt = new WeakMap<object, number>();

/**
 * settingsBlock returns the block the settings are for, with its position
 */
const settingsBlock = (state: EditorState, is: (node: Node) => boolean) => {
  const { selection } = state;
  if (selection instanceof NodeSelection && is(selection.node)) {
    return { node: selection.node, pos: selection.from };
  }
  const open = openBlock(state);
  return open && is(open.node) ? { node: open.node, pos: open.pos } : null;
};

/**
 * editBlockSettings opens the settings of a block below it, or closes them
 * while they are open
 */
export const editBlockSettings =
  <T, R extends BlockSettingsRequest<T>>({
    is,
    popover,
    values,
    attrs,
    more,
  }: BlockSettings<T, R>): Command =>
  (state, dispatch, view) => {
    const selected = settingsBlock(state, is);
    if (!selected) return false;
    if (!dispatch || !view) return true;
    const { node, pos } = selected;
    // the settings button, or the key, again closes them; those of another
    // block close, and this one's open
    const open = popover.value;
    if (open) {
      popover.value = null;
      open.close();
      if (openAt.get(open) === pos) return true;
    }
    // nowhere to open them while it isn't shown, e.g. before the first
    // layout; the key still does nothing else to it
    const box = boxOnCaretPage(view, pos, node.nodeSize);
    if (!box) return true;
    // the block still where the settings opened it
    const at = (state: EditorState) => {
      const there = state.doc.nodeAt(pos);
      return there && is(there) ? there : null;
    };
    const request: R = {
      ...(more?.(node) as R),
      anchor: box,
      values: values(node),
      apply: (changed: T) => {
        const there = at(view.state);
        if (!there) return;
        const next = attrs(there, changed);
        if (Object.keys(next).every((key) => next[key] === there.attrs[key])) {
          return;
        }
        const tr = view.state.tr.setNodeMarkup(pos, null, next);
        // a selected block stays selected; a source being typed stays open
        if (view.state.selection instanceof NodeSelection) {
          tr.setSelection(NodeSelection.create(tr.doc, pos));
        }
        view.dispatch(tr);
      },
      close: () => view.focus(),
    };
    openAt.set(request, pos);
    popover.value = request;
    return true;
  };
