import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { type PageChanges, writePageSettings } from "../../layout/settings";
import type { Unit } from "../../layout/units";
import { frontmatterOf, updateFrontmatter } from "../../markdown";

/**
 * frontmatterTr returns the transaction that replaces the frontmatter of the
 * document, or null when nothing changes
 */
const frontmatterTr = (
  state: EditorState,
  next: string | null,
): Transaction | null =>
  next === state.doc.attrs.frontmatter
    ? null
    : state.tr.setDocAttribute("frontmatter", next);

/**
 * pageTr returns the transaction that writes page settings into the
 * frontmatter of the document (see writePageSettings), or null when nothing
 * changes
 * @param unit the unit to write new lengths in
 */
export const pageTr = (state: EditorState, changes: PageChanges, unit: Unit) =>
  frontmatterTr(
    state,
    updateFrontmatter(frontmatterOf(state.doc), (document) =>
      writePageSettings(document, changes, unit),
    ),
  );

/**
 * writePage writes page settings into the frontmatter of the document as one
 * undo step, see writePageSettings
 * @param unit the unit to write new lengths in
 */
export const writePage = (
  view: EditorView,
  changes: PageChanges,
  unit: Unit,
) => {
  const tr = pageTr(view.state, changes, unit);
  if (tr) view.dispatch(tr);
};
