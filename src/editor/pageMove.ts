import type { EditorView } from "prosemirror-view";

import { pageDropGap } from "../state";
import {
  dragCopies,
  dropMoved,
  moveCandidate,
  movesBlock,
  showBlockDropAt,
  showDropAt,
} from "./pagePointer";

// Moving the selected text on the pages to another place: a press in it and
// a move of a few pixels, then where the pointer is let go. A press in it
// without a move places the caret there, as a click does. A selected block
// at the top of the document, like a table of contents or a form, moves the
// same way, between the blocks there, which a line shows. The page view
// (src/ui/PageView.vue) hands its pointer events to it.

// how far the pointer moves before a press in the selection drags it, in px
export const DRAG_START = 4;

export interface MoveTarget {
  view: EditorView;
  // the position a point of the window hits, null off the text
  posAt(event: MouseEvent): number | null;
  // whether a point of the window is on the page view, where text drops
  inView(event: MouseEvent): boolean;
  // places the caret where a press without a move was, as a click would
  press(x: number, y: number): void;
  // keeps the pointer's events coming while it's outside the view
  capture?(event: PointerEvent): void;
  // presses that aren't on the text, e.g. on a header, which never move it
  ignores?(event: PointerEvent): boolean;
}

export interface PageMove {
  // pointerdown: a press in the selected text may start a move
  down(event: PointerEvent): void;
  /**
   * mouseDown takes the mouse's press after pointerdown
   * @param taken whether a plugin took the press (see PAGE_PRESS)
   * @returns whether the page view leaves the press alone
   */
  mouseDown(event: MouseEvent, taken: boolean): boolean;
  move(event: PointerEvent): void;
  // whether the selected text is being dragged, past a press in it
  readonly dragging: boolean;
  up(event: PointerEvent): void;
  cancel(): void;
}

/**
 * pageMove follows a move of the selected text on the pages
 */
export const pageMove = (target: MoveTarget): PageMove => {
  let moving: {
    x: number;
    y: number;
    dragging: boolean;
    // whether a block at the top of the document moves, rather than text
    block: boolean;
  } | null = null;

  const cancel = () => {
    moving = null;
    showDropAt(target.view, null);
    showBlockDropAt(target.view, null);
  };

  /**
   * dropAt returns where the dragged text or block would drop for a point
   * of the window, or null off the pages
   */
  const dropAt = (event: PointerEvent, block: boolean) => {
    if (!target.inView(event)) return null;
    if (!block) return target.posAt(event);
    showBlockDropAt(target.view, { x: event.clientX, y: event.clientY });
    return pageDropGap.value;
  };

  return {
    down(event) {
      moving = null;
      if (event.button !== 0 || event.shiftKey || target.ignores?.(event))
        return;
      if (!moveCandidate(target.view.state, target.posAt(event))) return;
      moving = {
        x: event.clientX,
        y: event.clientY,
        dragging: false,
        block: movesBlock(target.view.state),
      };
      target.capture?.(event);
    },
    mouseDown(event, taken) {
      // a press a plugin took, e.g. to open a link, moves nothing; nor does
      // the second or third click of a double or triple click, whose press
      // selects a word or a line, even inside the selection
      if (taken || event.detail > 1) moving = null;
      return taken || moving !== null;
    },
    move(event) {
      if (!moving) return;
      // the button was let go where the view didn't see it
      if (!(event.buttons & 1)) return cancel();
      const far = Math.hypot(
        event.clientX - moving.x,
        event.clientY - moving.y,
      );
      if (!moving.dragging && far < DRAG_START) return;
      moving.dragging = true;
      if (moving.block) {
        showBlockDropAt(
          target.view,
          target.inView(event) ? { x: event.clientX, y: event.clientY } : null,
        );
      } else {
        showDropAt(
          target.view,
          target.inView(event) ? target.posAt(event) : null,
        );
      }
    },
    up(event) {
      const was = moving;
      moving = null;
      if (!was) return;
      if (was.dragging) {
        // let go outside the view, the move is cancelled, as ProseMirror
        // cancels a drop outside the editor
        const pos = dropAt(event, was.block);
        showDropAt(target.view, null);
        showBlockDropAt(target.view, null);
        if (pos !== null) dropMoved(target.view, pos, dragCopies(event));
        return;
      }
      target.press(was.x, was.y);
    },
    cancel,
    get dragging() {
      return moving?.dragging ?? false;
    },
  };
};
