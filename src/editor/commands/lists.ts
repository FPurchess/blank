import type { Node, NodeType } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import { liftListItem, wrapInList } from "prosemirror-schema-list";

import { schema } from "../../markdown";
import { rangeIn } from "./around";
import { isList } from "./listKeys";

/**
 * listAround returns the innermost bulleted or numbered list around the
 * whole selection, with its position, or null if it isn't in one
 */
export const listAround = (
  state: EditorState,
): { node: Node; pos: number } | null => {
  const range = rangeIn(state, isList);
  return range
    ? { node: range.parent, pos: range.$from.before(range.depth) }
    : null;
};

/**
 * toggleList turns the selection into a list of `type`: out of it if it's in
 * one already, into one of `type` if it's in the other kind, and into a new
 * one otherwise, as Word and Google Docs do. It goes by the list around the
 * whole selection, so a selection reaching out of a list wraps a new one.
 */
export const toggleList =
  (type: NodeType): Command =>
  (state, dispatch) => {
    const list = listAround(state);
    if (list?.node.type === type) {
      return liftListItem(schema.nodes.list_item)(state, dispatch);
    }
    if (list) {
      if (dispatch) {
        const attrs =
          type === schema.nodes.ordered_list
            ? { order: 1, tight: list.node.attrs.tight }
            : { tight: list.node.attrs.tight };
        dispatch(
          state.tr.setNodeMarkup(list.pos, type, attrs).scrollIntoView(),
        );
      }
      return true;
    }
    return wrapInList(type)(state, dispatch);
  };
