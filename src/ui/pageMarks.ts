import type { Node } from "prosemirror-model";
import type { Decoration, DecorationSet } from "prosemirror-view";

import type { PageEngine } from "../engine/engine";
import type { PageRect } from "../state";

// What the page view shows on the text besides the selection, on the pages
// in view: the underlines of misspelled words, from the spell check's
// decorations, the matches of find under the text, and the label of each
// page break. None of them is in the PDF, like in the editor.

export type MarkKind = "spelling" | "find" | "find-current" | "break";
export type PageMark = PageRect & { kind: MarkKind };

// the letter of each kind in the string a memo keeps
const CODES: Record<MarkKind, string> = {
  spelling: "s",
  find: "f",
  "find-current": "c",
  break: "b",
};
const KINDS = Object.fromEntries(
  Object.entries(CODES).map(([kind, code]) => [code, kind]),
) as Record<string, MarkKind>;

// the class of a mark of each kind, and whether it shows under the text,
// like a highlight, or over it
export const MARK_LOOKS: Record<
  MarkKind,
  { className: string; under: boolean }
> = {
  spelling: { className: "page-misspelling", under: false },
  find: { className: "page-find", under: true },
  "find-current": { className: "page-find current", under: true },
  break: { className: "page-break-mark", under: false },
};

// marks from decorations of a plugin: which kind each is, and the range it
// covers on the page, e.g. a whole formula for a match inside it
export interface MarkSource {
  decorations: DecorationSet | undefined;
  kind: MarkKind;
  range?: (from: number, to: number) => [from: number, to: number];
}

// what a source's decoration covers on the page
const rangeOf = (source: MarkSource, found: Decoration) =>
  source.range?.(found.from, found.to) ?? [found.from, found.to];

// what makes a page's marks what they are, besides its body's version: the
// misspelled words and page breaks on it, relative to where its text
// starts, so typing on another page, which only moves them, changes nothing
const signatureOf = (
  engine: PageEngine,
  doc: Node,
  sources: readonly MarkSource[],
  page: number,
) => {
  const span = engine.pageSpan(page);
  if (!span) return null;
  const from = Math.max(0, span.from - 1);
  const to = Math.min(doc.content.size, span.to + 1);
  const parts: string[] = [];
  for (const source of sources)
    for (const found of source.decorations?.find(from, to) ?? [])
      parts.push(
        `${CODES[source.kind]}${found.from - span.from}+${found.to - found.from}`,
      );
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
    sources: readonly MarkSource[],
    page: number,
    version: number,
  ): string {
    const signature = signatureOf(engine, doc, sources, page);
    if (signature === null) return "";
    const known = this.pages.get(page);
    if (known && known.version === version && known.signature === signature)
      return known.marks;
    const marks = marksOnPage(engine, doc, sources, page)
      .map((mark) =>
        [
          CODES[mark.kind],
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
  sources: readonly MarkSource[],
  page: number,
): PageMark[] => {
  const marks: PageMark[] = [];
  const span = engine.pageSpan(page);
  if (!span) return marks;
  const from = Math.max(0, span.from - 1);
  const to = Math.min(doc.content.size, span.to + 1);
  for (const source of sources) {
    for (const found of source.decorations?.find(from, to) ?? []) {
      for (const rect of engine.selection(...rangeOf(source, found))) {
        if (rect.page !== page) continue;
        marks.push({ ...rect, kind: source.kind });
      }
    }
  }
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "page_break") return !node.isTextblock;
    for (const box of engine.boxes(pos, pos + 1)) {
      if (box.page === page) marks.push({ ...box, kind: "break" });
    }
    return false;
  });
  return marks;
};

// a mark as a page frame shows it, from the string a memo keeps
export interface ShownMark {
  kind: MarkKind;
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
          kind: KINDS[kind],
          x,
          y,
          width,
          height,
          key: mark,
        };
      })
    : [];
