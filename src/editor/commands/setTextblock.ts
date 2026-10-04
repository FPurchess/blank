import type { Attrs, NodeType } from "prosemirror-model";
import type { Command } from "prosemirror-state";

/**
 * setTextblock turns the selected textblocks into `type` with `attrs`, as
 * prosemirror's setBlockType does, but each keeps its own alignment where
 * `type` has one (a paragraph or heading): a centered heading becomes a
 * centered paragraph. It applies where some selected textblock isn't `type`
 * with `attrs` yet, whatever its alignment.
 */
export const setTextblock =
  (type: NodeType, attrs: Attrs = {}): Command =>
  (state, dispatch) => {
    const { ranges } = state.selection;
    const applicable = ranges.some(({ $from, $to }) => {
      let found = false;
      state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
        if (found || !node.isTextblock) return !found;
        const same =
          node.type === type &&
          Object.entries(attrs).every(
            ([key, value]) => node.attrs[key] === value,
          );
        if (same) return false;
        const $pos = state.doc.resolve(pos);
        const index = $pos.index();
        found =
          node.type === type ||
          $pos.parent.canReplaceWith(index, index + 1, type);
        return false;
      });
      return found;
    });
    if (!applicable) return false;
    if (dispatch) {
      const keepsAlign = "align" in (type.spec.attrs ?? {});
      const tr = state.tr;
      for (const { $from, $to } of ranges) {
        tr.setBlockType($from.pos, $to.pos, type, (old) => ({
          ...attrs,
          ...(keepsAlign ? { align: old.attrs.align ?? null } : {}),
        }));
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
