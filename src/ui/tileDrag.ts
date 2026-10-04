import type { Node } from "prosemirror-model";

import { DRAG_START } from "../editor/pageMove";
import { gapAt } from "../engine/geometry";
import { pageDropGap } from "../state";

// Dragging a tile of the blocks pane onto the pages: a press on it and a
// move of a few pixels, then a line shows where the block would go, between
// two blocks at the top of the document, and letting go there inserts it.
// Letting go off the pages, Esc, or the pointer going away cancels it. It
// follows the pointer's events rather than the webview's drag and drop,
// which WebKitGTK and Tauri's own file drops make unreliable, and WebDriver
// can't drive.

export interface TileDragTarget {
  // the document the block goes into
  doc(): Node;
  // whether a point of the window is on the pages, where blocks drop
  onPages(x: number, y: number): boolean;
  // inserts the block `id` at `gap`
  drop(id: string, gap: number): void;
}

export interface TileDrag {
  // pointerdown on the tile `id`
  down(event: PointerEvent, id: string): void;
  move(event: PointerEvent): void;
  /**
   * up drops the dragged block where the line shows
   * @returns whether a drag ended, so the click that follows does nothing
   */
  up(event: PointerEvent): boolean;
  cancel(): void;
  readonly dragging: boolean;
}

/**
 * tileDrag follows a drag of a tile onto the pages
 */
export const tileDrag = (target: TileDragTarget): TileDrag => {
  let press: { id: string; x: number; y: number; dragging: boolean } | null =
    null;

  const cancel = () => {
    press = null;
    pageDropGap.value = null;
  };

  return {
    down(event, id) {
      press = null;
      if (event.button !== 0) return;
      press = { id, x: event.clientX, y: event.clientY, dragging: false };
      (event.currentTarget as Element | null)?.setPointerCapture?.(
        event.pointerId,
      );
    },
    move(event) {
      if (!press) return;
      if (!(event.buttons & 1)) return cancel();
      const { clientX: x, clientY: y } = event;
      if (!press.dragging && Math.hypot(x - press.x, y - press.y) < DRAG_START)
        return;
      press.dragging = true;
      pageDropGap.value = target.onPages(x, y)
        ? gapAt(target.doc(), x, y)
        : null;
    },
    up() {
      const was = press;
      const gap = pageDropGap.value;
      cancel();
      if (!was?.dragging) return false;
      if (gap !== null) target.drop(was.id, gap);
      return true;
    },
    cancel,
    get dragging() {
      return press?.dragging ?? false;
    },
  };
};
