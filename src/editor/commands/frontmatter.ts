import type { EditorView } from "prosemirror-view";

import { type PageChanges, writePageSettings } from "../../layout/settings";
import type { Unit } from "../../layout/units";
import { frontmatterOf, updateFrontmatter } from "../../markdown";

/**
 * setFrontmatter replaces the frontmatter of the document as one undo step,
 * and does nothing when nothing changes
 */
export const setFrontmatter = (view: EditorView, next: string | null) => {
  if (next !== view.state.doc.attrs.frontmatter) {
    view.dispatch(view.state.tr.setDocAttribute("frontmatter", next));
  }
};

/**
 * writePage writes page settings into the frontmatter of the document, see
 * writePageSettings
 * @param unit the unit to write new lengths in
 */
export const writePage = (view: EditorView, changes: PageChanges, unit: Unit) =>
  setFrontmatter(
    view,
    updateFrontmatter(frontmatterOf(view.state.doc), (document) =>
      writePageSettings(document, changes, unit),
    ),
  );
