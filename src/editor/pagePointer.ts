import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { engineless } from "../engine/engine";

// What the pointer does on the painted pages, told to the editor's plugins.
// The editor's own DOM is hidden and gets no mouse events, so the page view
// (src/ui/PageView.vue) hits each press through the layout and sends it to
// the editor as one of these events, which plugins handle in their
// `handleDOMEvents` like any other DOM event.

// a press of any button, before the page view places the caret; a plugin
// that handles it calls `preventDefault()`, and the page view then leaves
// the selection alone
export const PAGE_PRESS = "pagepress";
// a right click, for the context menu
export const PAGE_MENU = "pagemenu";

export interface PagePointer {
  // the position the point hits, null off the text
  pos: number | null;
  // the link under the point, if any
  link: string | null;
  // the point in the window
  x: number;
  y: number;
  button: number;
  // the modifiers held
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export type PagePointerEvent = CustomEvent<PagePointer>;

/**
 * sendPagePointer sends a press or right click on the pages to the editor
 * @returns whether a plugin handled it
 */
export const sendPagePointer = (
  view: EditorView,
  type: typeof PAGE_PRESS | typeof PAGE_MENU,
  pointer: PagePointer,
) => {
  const event: PagePointerEvent = new CustomEvent(type, {
    detail: pointer,
    cancelable: true,
  });
  // a test view has no DOM
  view.dom?.dispatchEvent(event);
  return event.defaultPrevented;
};

/**
 * pointerOf returns what a mouse event on the editor's own DOM hits, while
 * the editor shows the text itself. The link is left out: openLink opens a
 * link clicked in the editor by itself.
 */
const pointerOf = (view: EditorView, event: MouseEvent): PagePointer => ({
  pos:
    view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null,
  link: null,
  x: event.clientX,
  y: event.clientY,
  button: event.button,
  shiftKey: event.shiftKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  altKey: event.altKey,
});

/**
 * nativePointer hands the plugins the presses and right clicks on the
 * editor's own DOM as the page view's events, while there is no engine and
 * the editor shows the text itself, so they work the same without the pages.
 * It comes before contextMenu, which takes the ContextMenu key's event.
 */
export const nativePointer = () =>
  new Plugin({
    props: {
      handleDOMEvents: {
        mousedown: (view, event) => {
          if (!engineless()) return false;
          if (!sendPagePointer(view, PAGE_PRESS, pointerOf(view, event)))
            return false;
          // a plugin took the press, so ProseMirror leaves the selection
          event.preventDefault();
          return true;
        },
        contextmenu: (view, event) => {
          if (!engineless() || event.shiftKey) return false;
          // the ContextMenu key's event, which contextMenu handles
          if (event.button !== 2 && event.clientX === 0 && event.clientY === 0)
            return false;
          event.preventDefault();
          sendPagePointer(view, PAGE_MENU, pointerOf(view, event));
          return true;
        },
      },
    },
  });
