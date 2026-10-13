import type { PageSize } from "../engine/frames";
import type { PdfRect as Rect } from "../pdf/ipc";
import { type Corner, moveTo, resizeTo, type Stamp } from "../pdf/stampModel";

// Dragging a stamp on a PDF's page with the mouse (StampOverlay.vue): a
// press on it moves it, a press on one of its four corners resizes it with
// its shape kept, from the opposite corner. Pointer events with the pointer
// captured, not HTML5 drag and drop; it starts once the pointer moved
// DRAG_START pixels, and is kept on the page as the keys keep it. What it
// shows meanwhile is a preview: the stamp changes once, when it's let go,
// so a drag is one step of the history.

// how far the pointer moves before a press drags, in CSS pixels
export const DRAG_START = 4;

export interface Drag {
  // what the press is on: the stamp, or a corner
  grip: "move" | Corner;
  // where it started, in CSS pixels
  x: number;
  y: number;
  // the stamp as it was
  stamp: Stamp;
  // whether it's dragging yet
  moving: boolean;
}

const OPPOSITE: Record<Corner, Corner> = {
  "top-left": "bottom-right",
  "top-right": "bottom-left",
  "bottom-left": "top-right",
  "bottom-right": "top-left",
};

/**
 * startDrag returns the drag a press at `x`, `y` on `grip` of `stamp`
 * starts
 */
export const startDrag = (
  stamp: Stamp,
  grip: Drag["grip"],
  x: number,
  y: number,
): Drag => ({ grip, x, y, stamp, moving: false });

/**
 * dragTo returns `drag` with the pointer at `x`, `y`, and the stamp as it
 * shows then (null while the pointer is within DRAG_START of the press)
 * @param scale CSS pixels per point
 */
export const dragTo = (
  drag: Drag,
  x: number,
  y: number,
  scale: number,
  page: PageSize,
): { drag: Drag; stamp: Stamp | null } => {
  const moving =
    drag.moving || Math.hypot(x - drag.x, y - drag.y) >= DRAG_START;
  if (!moving) return { drag, stamp: null };
  const next = { ...drag, moving };
  const dx = (x - drag.x) / scale;
  const dy = (y - drag.y) / scale;
  const [left, top, width, height] = drag.stamp.rect;
  if (drag.grip === "move")
    return { drag: next, stamp: moveTo(drag.stamp, left + dx, top + dy, page) };
  // the corner follows the pointer the way it went further, its shape kept
  const across = drag.grip.endsWith("right") ? dx : -dx;
  const down = drag.grip.startsWith("bottom") ? dy : -dy;
  const byHeight = height > 0 ? (down * width) / height : 0;
  const grow = Math.abs(across) >= Math.abs(byHeight) ? across : byHeight;
  return {
    drag: next,
    stamp: resizeTo(drag.stamp, width + grow, page, OPPOSITE[drag.grip]),
  };
};

/**
 * sameRect tells whether two rects are the same
 */
export const sameRect = (a: Rect, b: Rect) =>
  a.every((value, index) => value === b[index]);
