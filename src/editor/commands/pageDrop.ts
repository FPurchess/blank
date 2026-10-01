import type { Slice } from "prosemirror-model";
import { type Command, NodeSelection, TextSelection } from "prosemirror-state";
import { dropPoint } from "prosemirror-transform";

/**
 * pageDrop puts dragged content where it was dropped on the pages, as
 * ProseMirror does with a drop on its own DOM: it moves the dragged range
 * there, or copies it without `moved`, and selects what it put there
 * @param moved the range the content was dragged from, to move it
 */
export const pageDrop =
  (
    slice: Slice,
    pos: number,
    moved: { from: number; to: number } | null,
  ): Command =>
  (state, dispatch) => {
    // dropped onto itself
    if (moved && pos >= moved.from && pos <= moved.to) return true;
    const tr = state.tr;
    if (moved) tr.delete(moved.from, moved.to);
    const mapped = tr.mapping.map(pos);
    const node =
      slice.openStart === 0 &&
      slice.openEnd === 0 &&
      slice.content.childCount === 1
        ? slice.content.firstChild
        : null;
    const at = dropPoint(tr.doc, mapped, slice) ?? mapped;
    const before = tr.doc;
    if (node) tr.replaceRangeWith(at, at, node);
    else tr.replaceRange(at, at, slice);
    if (tr.doc.eq(before)) return false;
    const $at = tr.doc.resolve(at);
    if (
      node &&
      NodeSelection.isSelectable(node) &&
      $at.nodeAfter?.sameMarkup(node)
    ) {
      tr.setSelection(new NodeSelection($at));
    } else {
      // up to where the last step put it
      let end = at;
      tr.mapping.maps[tr.mapping.maps.length - 1].forEach(
        (_from, _to, _newFrom, newTo) => (end = newTo),
      );
      tr.setSelection(TextSelection.between($at, tr.doc.resolve(end)));
    }
    dispatch?.(tr.scrollIntoView().setMeta("uiEvent", "drop"));
    return true;
  };
