import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { type PageChanges, writePageSettings } from "../../layout/settings";
import type { Unit } from "../../layout/units";
import { frontmatterOf, updateFrontmatter } from "../../markdown";

/**
 * frontmatterTr returns the transaction that replaces the frontmatter of the
 * document, or null when nothing changes
 */
export const frontmatterTr = (
  state: EditorState,
  next: string | null,
): Transaction | null =>
  next === state.doc.attrs.frontmatter
    ? null
    : state.tr.setDocAttribute("frontmatter", next);

/**
 * pageFrontmatter returns the frontmatter with page settings written into
 * it, see writePageSettings
 * @param unit the unit to write new lengths in
 */
export const pageFrontmatter = (
  frontmatter: string | null,
  changes: PageChanges,
  unit: Unit,
) =>
  updateFrontmatter(frontmatter, (document) =>
    writePageSettings(document, changes, unit),
  );

/**
 * setFrontmatter replaces the frontmatter of the document as one undo step,
 * and does nothing when nothing changes
 */
export const setFrontmatter = (view: EditorView, next: string | null) => {
  const tr = frontmatterTr(view.state, next);
  if (tr) view.dispatch(tr);
};

/**
 * writePage writes page settings into the frontmatter of the document, see
 * writePageSettings
 * @param unit the unit to write new lengths in
 */
export const writePage = (view: EditorView, changes: PageChanges, unit: Unit) =>
  setFrontmatter(
    view,
    pageFrontmatter(frontmatterOf(view.state.doc), changes, unit),
  );
