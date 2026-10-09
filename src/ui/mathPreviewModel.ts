import { type MathLayout, pageEngine } from "../engine/engine";
import { mathError } from "../math/register";

// What the preview under inline math being edited shows: the formula as
// the engine sets it, drawn at the pages' zoom, or what's wrong with it.

export type PreviewShows =
  | { kind: "math"; layout: Extract<MathLayout, { ok: true }> }
  | { kind: "error"; text: string }
  | { kind: "none" };

/**
 * previewOf returns what the preview of `latex` shows
 */
export const previewOf = (latex: string): PreviewShows => {
  if (!latex.trim() || !pageEngine) return { kind: "none" };
  const laid = pageEngine.mathLayout(latex, false);
  if (laid.ok === true) return { kind: "math", layout: laid };
  if (laid.ok === false) {
    return {
      kind: "error",
      text: mathError(laid.error, laid.line, laid.column),
    };
  }
  return { kind: "none" };
};

// the rects of the find panel and the block toolbar, which it stays clear of
const OBSTACLES = ["#find-panel", "#block-toolbar"];

/**
 * obstacles returns where the parts of the window it stays clear of are
 */
export const obstacles = () =>
  OBSTACLES.flatMap((selector) => {
    const element = document.querySelector(selector);
    return element ? [element.getBoundingClientRect()] : [];
  });
