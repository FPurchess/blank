import { DRAG_START } from "../editor/pageMove";
import { dropAt, movedBy } from "./dragModel";

// Dragging a tab along the tab row (TabRow.vue): a press on a tab and a move
// of a few pixels, then the tab moves among the others as its middle passes
// theirs, the way browsers do. It never leaves the row. It follows the
// pointer's events, as tileDrag.ts does, which WebDriver can drive.

export interface TabDragTarget {
  // the boxes of the tabs, in the row's order
  boxes(): readonly { left: number; right: number }[];
  // where the tab `id` is in the row
  indexOf(id: string): number;
  // moves the tab `id` by `by` places, once the moves before it are done
  move(id: string, by: number): Promise<unknown>;
  // keeps the pointer's events with the row while it drags
  capture(pointerId: number): void;
}

/**
 * edgesOf returns the lines between `boxes`: the left edge of each, and the
 * right edge of the last
 */
export const edgesOf = (boxes: readonly { left: number; right: number }[]) =>
  boxes.length === 0
    ? []
    : [...boxes.map((box) => box.left), boxes[boxes.length - 1].right];

/**
 * dragBy returns by how many places the tab at `index` moves when its
 * middle is dragged to `x`: to the nearest of the lines between the tabs
 */
export const dragBy = (edges: readonly number[], index: number, x: number) =>
  movedBy([index, index + 1], dropAt(edges, [index, index + 1], x, 0));

/**
 * tabDrag follows a drag of a tab along the row
 */
export const tabDrag = (target: TabDragTarget) => {
  // the tab pressed, where, and how far from its middle
  let press: { id: string; x: number; grab: number; moving: boolean } | null =
    null;
  // the move asked for and not done yet, which the next waits for
  let moving: Promise<unknown> | null = null;
  // whether the click that follows the press ends a drag, and does nothing
  let dragged = false;

  const cancel = () => {
    press = null;
  };

  return {
    // pointerdown on the tab `id`
    down(event: PointerEvent, id: string) {
      press = null;
      dragged = false;
      if (event.button !== 0) return;
      const box = target.boxes()[target.indexOf(id)];
      const middle = box ? (box.left + box.right) / 2 : event.clientX;
      press = {
        id,
        x: event.clientX,
        grab: event.clientX - middle,
        moving: false,
      };
    },
    move(event: PointerEvent) {
      if (!press) return;
      if (!(event.buttons & 1)) return cancel();
      if (!press.moving) {
        if (Math.abs(event.clientX - press.x) < DRAG_START) return;
        // the drag follows the pointer off the row too, once it's a drag: a
        // capture before would take the click from the tab
        target.capture(event.pointerId);
        press.moving = true;
      }
      if (moving) return;
      const { id } = press;
      const by = dragBy(
        edgesOf(target.boxes()),
        target.indexOf(id),
        event.clientX - press.grab,
      );
      if (by !== 0) {
        moving = target.move(id, by).finally(() => (moving = null));
      }
    },
    // pointerup or pointercancel
    up() {
      dragged = press?.moving ?? false;
      press = null;
    },
    /**
     * clicked tells whether a click is a click, not the end of a drag
     */
    clicked() {
      const was = dragged;
      dragged = false;
      return !was;
    },
    cancel,
  };
};
