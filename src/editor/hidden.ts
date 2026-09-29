import type { EditorView } from "prosemirror-view";

// The editor's own DOM is hidden (see #editor in main.scss): the page view
// paints the text. It keeps the focus, the keys and the IME, and it is what
// screen readers read. alignHiddenEditor moves it so that its caret sits
// where the painted caret is, which is where the IME shows its window.

const offsets = new WeakMap<EditorView, { x: number; y: number }>();

/**
 * alignHiddenEditor moves the hidden editor so that its caret is at `x`,
 * `y` in the window
 */
export const alignHiddenEditor = (view: EditorView, x: number, y: number) => {
  let coords: { left: number; top: number };
  try {
    coords = view.coordsAtPos(view.state.selection.head);
  } catch {
    return;
  }
  const current = offsets.get(view) ?? { x: 0, y: 0 };
  const dx = x - coords.left;
  const dy = y - coords.top;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
  const next = { x: current.x + dx, y: current.y + dy };
  offsets.set(view, next);
  view.dom.style.transform = `translate(${next.x}px, ${next.y}px)`;
};
