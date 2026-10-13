import type { Frame } from "../engine/frames";
import type { PdfRect as PageRect } from "../pdf/ipc";
import { BIG_STEP, STEP } from "../pdf/stampModel";
import type { Rect } from "./rect";

// What the stamps on a PDF's pages (StampOverlay.vue) work out: where a
// stamp shows on the desk, where its toolbar goes, and what a key does to a
// selected stamp.

/**
 * stampBox returns where a stamp at `rect` (points) of the page of `frame`
 * shows on the desk, in CSS pixels at `scale` per point
 */
export const stampBox = (
  rect: PageRect,
  frame: Frame,
  scale: number,
): Rect => ({
  left: frame.left + rect[0] * scale,
  top: frame.top + rect[1] * scale,
  width: rect[2] * scale,
  height: rect[3] * scale,
});

// the room between a stamp and its toolbar, and the toolbar's height
const TOOLBAR_GAP = 8;
export const TOOLBAR_HEIGHT = 36;

/**
 * toolbarSpot returns where the toolbar of a stamp at `box` goes: above it,
 * or below it where the desk has no room above
 */
export const toolbarSpot = (box: Rect) => {
  const above = box.top - TOOLBAR_GAP - TOOLBAR_HEIGHT;
  return {
    left: box.left,
    top: above >= 0 ? above : box.top + box.height + TOOLBAR_GAP,
  };
};

// what a key does to the stamp selected
export type StampKeyAction =
  | { kind: "nudge"; dx: number; dy: number }
  | { kind: "resize"; by: number }
  | { kind: "remove" }
  | { kind: "deselect" };

/**
 * stampKeyAction returns what the key `event` does to a selected stamp, or
 * null for one it leaves to the page view (Tab, the commands' keys):
 * arrows nudge it 1 pt, with Shift 10 pt; Alt and → or ↑ make it larger,
 * ← or ↓ smaller; Delete and Backspace remove it; Esc deselects it
 */
export const stampKeyAction = (
  event: Pick<
    KeyboardEvent,
    "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey"
  >,
): StampKeyAction | null => {
  if (event.ctrlKey || event.metaKey) return null;
  const step = event.shiftKey ? BIG_STEP : STEP;
  const arrows: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const arrow = arrows[event.key];
  if (arrow && event.altKey) {
    const grows = event.key === "ArrowRight" || event.key === "ArrowUp";
    return { kind: "resize", by: grows ? step : -step };
  }
  if (event.altKey) return null;
  if (arrow) return { kind: "nudge", dx: arrow[0] * step, dy: arrow[1] * step };
  if (event.shiftKey) return null;
  if (event.key === "Delete" || event.key === "Backspace")
    return { kind: "remove" };
  if (event.key === "Escape") return { kind: "deselect" };
  return null;
};
