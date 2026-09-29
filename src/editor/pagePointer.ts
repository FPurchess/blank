import type { EditorView } from "prosemirror-view";

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
