import { Plugin } from "prosemirror-state";

import { changedDescendants } from "./changed";

/**
 * alignmentGuard keeps alignment on the paragraphs and headings at the top of
 * the document, the only ones markdown keeps it for (see
 * src/markdown/alignment.ts): one wrapped into a list or quote, pasted into a
 * cell or dropped into a form's field loses it, so what shows is what gets
 * saved. The repair joins the change it follows in the history, so undoing
 * that change brings the alignment back.
 */
export const alignmentGuard = () =>
  new Plugin({
    appendTransaction(transactions, oldState, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const nested: number[] = [];
      changedDescendants(oldState.doc, state.doc, 0, (node, pos, parent) => {
        if (!node.isTextblock) return true;
        if (parent !== state.doc && node.attrs.align) nested.push(pos);
        return false;
      });
      if (nested.length === 0) return null;
      const tr = state.tr;
      for (const pos of nested) tr.setNodeAttribute(pos, "align", null);
      return tr;
    },
  });
