import type { EditorHandle } from "../editor/handle";
import { pageSelect, pageSelectRange } from "../editor/commands/pageSelect";
import type { PageEngine } from "../engine/engine";
import { type FrameLayout, pointOnPage } from "../engine/frames";
import { pageLayoutState } from "../state";

// What the pointer does on the painted pages: a click places the caret, a
// double click selects a word, a triple click a line, Shift extends the
// selection, and a drag selects from where it started. Every point is hit
// through the engine's layout.

export interface PointerTarget {
  engine: PageEngine;
  editor: EditorHandle;
  layout: FrameLayout;
}

/**
 * press handles a press at a point of the desk
 * @param count 1, 2 or 3 for a click, double and triple click
 * @returns the anchor a drag from here selects from, or null
 */
export const press = (
  { engine, editor, layout }: PointerTarget,
  x: number,
  y: number,
  { count = 1, shift = false } = {},
): number | null => {
  const point = pointOnPage(layout, x, y);
  if (!point) return null;
  if (count === 2) {
    const word = engine.word(point.page, point.x, point.y);
    if (word) {
      editor.run(pageSelectRange(word.from, word.to));
      return word.from;
    }
  }
  const hit = engine.hit(point.page, point.x, point.y);
  if (!hit) return null;
  if (count === 3 && !hit.node) {
    const from = engine.lineEdge(hit.pos, false);
    const to = engine.lineEdge(hit.pos, true);
    if (from !== null && to !== null) {
      editor.run(pageSelectRange(from, to));
      return from;
    }
  }
  const anchor = shift ? editor.view.state.selection.anchor : undefined;
  editor.run(pageSelect(hit, anchor));
  return hit.node ? null : (anchor ?? hit.pos);
};

/**
 * drag extends the selection from `anchor` to a point of the desk
 */
export const drag = (
  { engine, editor, layout }: PointerTarget,
  anchor: number,
  x: number,
  y: number,
) => {
  const point = pointOnPage(layout, x, y);
  if (!point) return;
  const hit = engine.hit(point.page, point.x, point.y);
  if (hit)
    editor.run(pageSelect({ node: false, pos: hit.pos }, anchor), {
      focus: false,
    });
};

/**
 * targetAt returns what a point of the desk hits: the position, and the
 * link under it
 */
export const targetAt = (
  { engine, layout }: Omit<PointerTarget, "editor">,
  x: number,
  y: number,
) => {
  const point = pointOnPage(layout, x, y);
  if (!point) return { pos: null, link: null };
  const hit = engine.hit(point.page, point.x, point.y);
  // links are in the text, never in a header or footer
  const version = pageLayoutState.value?.bodyVersions[point.page] ?? 0;
  const link = engine
    .bodyDisplay(point.page, version)
    .l.find(
      ([, lx, ly, w, h]) =>
        point.x >= lx &&
        point.x <= lx + w &&
        point.y >= ly &&
        point.y <= ly + h,
    );
  return { pos: hit?.pos ?? null, link: link?.[0] ?? null };
};

// how near the top and bottom edges of the view a drag scrolls, and how
// fast at most, in px per frame
const EDGE = 24;
const MAX_STEP = 40;

/**
 * edgeStep returns how far a drag at `y` scrolls the view from `top` to
 * `bottom` in a frame: up near or above the top, down near or below the
 * bottom, the farther the faster
 */
export const edgeStep = (y: number, top: number, bottom: number) => {
  if (y < top + EDGE)
    return -Math.min(MAX_STEP, Math.ceil((top + EDGE - y) / 2));
  if (y > bottom - EDGE)
    return Math.min(MAX_STEP, Math.ceil((y - bottom + EDGE) / 2));
  return 0;
};
