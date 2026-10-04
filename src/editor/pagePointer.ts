import {
  type EditorState,
  NodeSelection,
  Plugin,
  TextSelection,
} from "prosemirror-state";
import { dropPoint } from "prosemirror-transform";
import type { EditorView } from "prosemirror-view";

import { invoke } from "@tauri-apps/api/core";

import { engineless, pageEngine } from "../engine/engine";
import { gapAt } from "../engine/geometry";
import { pageDropCaret, pageDropGap } from "../state";
import { pageDrop } from "./commands/pageDrop";
import { pasteText } from "./plugins/tables/clipboard";

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

/**
 * movesBlock tells whether the selection is a block at the top of the
 * document, e.g. a table of contents or a form, which moves between the
 * blocks there
 */
export const movesBlock = (state: EditorState) =>
  state.selection instanceof NodeSelection && state.selection.$from.depth === 0;

/**
 * moveCandidate tells whether a press at `pos` lands in the selected text,
 * or on the selected block at the top of the document, where it may start
 * dragging it
 */
export const moveCandidate = (state: EditorState, pos: number | null) => {
  const { selection } = state;
  if (pos === null) return false;
  if (movesBlock(state)) return pos >= selection.from && pos < selection.to;
  return (
    selection instanceof TextSelection &&
    !selection.empty &&
    pos > selection.from &&
    pos < selection.to
  );
};

const mac =
  typeof navigator !== "undefined" &&
  /Mac|iP(hone|ad)/.test(navigator.platform);

/**
 * dragCopies tells whether a drag copies the text rather than moving it:
 * with Option held on macOS and Ctrl elsewhere, as in ProseMirror
 */
export const dragCopies = (event: { altKey: boolean; ctrlKey: boolean }) =>
  mac ? event.altKey : event.ctrlKey;

/**
 * showDropAt shows where the dragged selection would drop, or nothing for
 * null
 * @param own false for text dragged from another app, which drops where it
 *   is let go, as a paste there
 */
export const showDropAt = (
  view: EditorView,
  pos: number | null,
  own = true,
) => {
  if (pos === null) {
    pageDropCaret.value = null;
    return;
  }
  const at = own
    ? (dropPoint(view.state.doc, pos, view.state.selection.content()) ?? pos)
    : pos;
  pageDropCaret.value = pageEngine?.caret(at) ?? null;
};

/**
 * showBlockDropAt shows where the dragged block would drop: the place
 * between two blocks at the top of the document nearest a point of the
 * window, or nothing for null
 */
export const showBlockDropAt = (
  view: EditorView,
  point: { x: number; y: number } | null,
) => {
  pageDropGap.value = point && gapAt(view.state.doc, point.x, point.y);
};

/**
 * dropMoved drops the selected text dragged on the pages at `pos`: moves
 * it there, or copies it
 */
export const dropMoved = (view: EditorView, pos: number, copy: boolean) => {
  pageDropCaret.value = null;
  pageDropGap.value = null;
  const { selection } = view.state;
  return pageDrop(
    selection.content(),
    pos,
    copy ? null : { from: selection.from, to: selection.to },
  )(view.state, view.dispatch);
};

/**
 * dropExternal puts what another app dropped on the pages at `pos`, as a
 * paste there would
 */
export const dropExternal = (
  view: EditorView,
  pos: number,
  data: Pick<DataTransfer, "getData">,
) => {
  pageDropCaret.value = null;
  const html = data.getData("text/html");
  const text = data.getData("text/plain");
  if (!html && !text) return false;
  const $pos = view.state.doc.resolve(
    Math.max(0, Math.min(pos, view.state.doc.content.size)),
  );
  view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
  if (html) view.pasteHTML(html);
  else pasteText(view, text, false);
  return true;
};

/**
 * hasPrimarySelection tells whether the system has a primary selection,
 * which a middle click pastes: Linux, on X11 and Wayland, but not macOS or
 * Windows
 */
export const hasPrimarySelection = () =>
  typeof navigator !== "undefined" &&
  /Linux/.test(navigator.platform) &&
  !/Android/.test(navigator.userAgent);

/**
 * pastePrimary pastes the primary selection, the text selected last in any
 * app, at `pos`, as a middle click does in other apps: the caret goes there
 * as with a click, and the text comes as plain text
 * @returns whether it took the middle click
 */
export const pastePrimary = async (view: EditorView, pos: number | null) => {
  if (!hasPrimarySelection() || pos === null) return false;
  const { doc } = view.state;
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.near(
        doc.resolve(Math.max(0, Math.min(pos, doc.content.size))),
      ),
    ),
  );
  let text: string | null = null;
  try {
    text = await invoke<string | null>("read_primary");
  } catch (error) {
    console.error("failed to read the primary selection", error);
  }
  // the editor may be gone by then, e.g. with another document
  if (text && !view.isDestroyed) pasteText(view, text, true);
  return true;
};
