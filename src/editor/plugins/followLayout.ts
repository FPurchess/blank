import type { EditorView } from "prosemirror-view";
import { watch } from "vue";

import { engineless } from "../../engine/engine";
import { blockBoxes, caretPage } from "../../engine/geometry";
import { pageLayoutState, pageViewport } from "../../state";

/**
 * followLayout calls `publish` again whenever the page view scrolled,
 * resized or switched, or the pages were laid out again (e.g. once an image
 * above loaded), and, without the engine, whenever the editor itself
 * scrolls. Like a watcher, it belongs to whatever scope is active.
 * @returns what stops it
 */
export const followLayout = (publish: () => void) => {
  const stop = watch([pageViewport, pageLayoutState], publish, {
    flush: "sync",
  });
  const scrolled = () => {
    if (engineless()) publish();
  };
  window.addEventListener("scroll", scrolled, true);
  return () => {
    stop();
    window.removeEventListener("scroll", scrolled, true);
  };
};

/**
 * boxOnCaretPage returns the box of the block at `pos`, `size` long, on the
 * page the cursor is on, or on its first page, as the screen shows it, e.g.
 * for a toolbar over it
 */
export const boxOnCaretPage = (view: EditorView, pos: number, size: number) => {
  const boxes = blockBoxes(pos, pos + size);
  const page = caretPage(view.state.selection.head);
  return boxes.find((box) => box.page === page) ?? boxes[0] ?? null;
};
