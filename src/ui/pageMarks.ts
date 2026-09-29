import type { EditorState } from "prosemirror-state";

import type { PageEngine } from "../engine/engine";
import { spellcheckKey } from "../editor/plugins/spellcheck";
import type { PageRect } from "../state";

// What the page view shows over the text besides the selection, on the
// pages in view: the underlines of misspelled words, from the spell check's
// decorations, and the label of each page break. Neither is in the PDF,
// like in the editor.

export type PageMark = PageRect & {
  kind: "spelling" | "break";
  // tells the marks apart, for Vue
  key: string;
};

/**
 * marksOn returns the marks on `pages`
 */
export const marksOn = (
  engine: PageEngine,
  state: EditorState,
  pages: readonly number[],
): PageMark[] => {
  const marks: PageMark[] = [];
  const decorations = spellcheckKey.getState(state)?.decorations;
  const size = state.doc.content.size;
  for (const page of pages) {
    const span = engine.pageSpan(page);
    if (!span) continue;
    const from = Math.max(0, span.from - 1);
    const to = Math.min(size, span.to + 1);
    for (const found of decorations?.find(from, to) ?? []) {
      for (const rect of engine.selection(found.from, found.to)) {
        if (rect.page !== page) continue;
        marks.push({
          ...rect,
          kind: "spelling",
          key: `s${found.from}:${rect.y}`,
        });
      }
    }
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== "page_break") return !node.isTextblock;
      for (const box of engine.boxes(pos, pos + 1)) {
        if (box.page === page)
          marks.push({ ...box, kind: "break", key: `b${pos}` });
      }
      return false;
    });
  }
  return marks;
};
