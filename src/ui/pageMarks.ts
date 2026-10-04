import type { Node } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";

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

// what makes a page's marks what they are, besides its body's version: the
// misspelled words and page breaks on it, relative to where its text
// starts, so typing on another page, which only moves them, changes nothing
const signatureOf = (
  engine: PageEngine,
  doc: Node,
  decorations: DecorationSet | undefined,
  page: number,
) => {
  const span = engine.pageSpan(page);
  if (!span) return null;
  const from = Math.max(0, span.from - 1);
  const to = Math.min(doc.content.size, span.to + 1);
  const parts: string[] = [];
  for (const found of decorations?.find(from, to) ?? [])
    parts.push(`s${found.from - span.from}+${found.to - found.from}`);
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "page_break") return !node.isTextblock;
    parts.push(`b${pos - span.from}`);
    return false;
  });
  return parts.join(" ");
};

// a page's marks, as one string of "kind x,y,width,height" separated by ";",
// in points on the page
interface Memo {
  version: number;
  signature: string;
  marks: string;
}

/**
 * PageMarksMemo keeps each page's marks, worked out again only when the
 * page's text or the marks on it change: typing doesn't measure the marks
 * of the other pages, and a page keeps the very same string, so the page
 * view renders nothing of it again
 */
export class PageMarksMemo {
  private pages = new Map<number, Memo>();

  /**
   * marksOn returns the marks on `page`, whose body is at `version`
   */
  marksOn(
    engine: PageEngine,
    doc: Node,
    decorations: DecorationSet | undefined,
    page: number,
    version: number,
  ): string {
    const signature = signatureOf(engine, doc, decorations, page);
    if (signature === null) return "";
    const known = this.pages.get(page);
    if (known && known.version === version && known.signature === signature)
      return known.marks;
    const marks = marksOnPage(engine, doc, decorations, page)
      .map((mark) =>
        [
          mark.kind === "spelling" ? "s" : "b",
          [mark.x, mark.y, mark.width, mark.height]
            .map((value) => Math.round(value * 100) / 100)
            .join(","),
        ].join(" "),
      )
      .join(";");
    this.pages.set(page, { version, signature, marks });
    return marks;
  }
}

/**
 * marksOnPage returns the marks on `page`, measured through the engine
 */
const marksOnPage = (
  engine: PageEngine,
  doc: Node,
  decorations: DecorationSet | undefined,
  page: number,
): PageMark[] => {
  const marks: PageMark[] = [];
  const span = engine.pageSpan(page);
  if (!span) return marks;
  const from = Math.max(0, span.from - 1);
  const to = Math.min(doc.content.size, span.to + 1);
  for (const found of decorations?.find(from, to) ?? []) {
    for (const rect of engine.selection(found.from, found.to)) {
      if (rect.page !== page) continue;
      marks.push({ ...rect, kind: "spelling", key: "" });
    }
  }
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "page_break") return !node.isTextblock;
    for (const box of engine.boxes(pos, pos + 1)) {
      if (box.page === page) marks.push({ ...box, kind: "break", key: "" });
    }
    return false;
  });
  return marks;
};

// a mark as a page frame shows it, from the string a memo keeps
export interface ShownMark {
  kind: "spelling" | "break";
  x: number;
  y: number;
  width: number;
  height: number;
  // its place on the page, which stays while the mark does, whatever moves
  // in the document before it
  key: string;
}

/**
 * shownMarks reads the marks PageMarksMemo wrote
 */
export const shownMarks = (marks: string): ShownMark[] =>
  marks
    ? marks.split(";").map((mark) => {
        const [kind, box] = mark.split(" ");
        const [x, y, width, height] = box.split(",").map(Number);
        return {
          kind: kind === "s" ? "spelling" : "break",
          x,
          y,
          width,
          height,
          key: mark,
        };
      })
    : [];
