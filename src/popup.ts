import type { Anchor, TableToolbarState } from "./state";

// space between a popup and the edges of the window
const MARGIN = 4;

/**
 * place moves `element` below `anchor`, or above it if it only fits there,
 * or else as far up as it needs to fit, like the system menus. A submenu opens
 * next to the item `side`.
 */
export const place = (element: HTMLElement, anchor: Anchor, side?: DOMRect) => {
  const { width, height } = element.getBoundingClientRect();
  const bottom = window.innerHeight - MARGIN;
  let left = side ? side.right : anchor.left;
  let top = side ? side.top : anchor.bottom + 2;
  if (side && left + width > window.innerWidth - MARGIN) {
    left = side.left - width;
  }
  if (top + height > bottom) {
    const above = anchor.top - height - 2;
    top = !side && above >= MARGIN ? above : bottom - height;
  }
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - MARGIN - width));
  top = Math.max(MARGIN, top);
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
};

// the space between the toolbar and the table, which leaves room for the
// handles on the table's top edge (src/ui/TableHandles.vue), and the
// window's edges
const TOOLBAR_GAP = 10;
// the top bar with the file name, which the toolbar stays below
const TOOLBAR_TOP = 36;

type ToolbarAnchor = TableToolbarState["anchor"];

/**
 * placeToolbar puts the table toolbar above the table's right end, where it
 * rarely covers the text above, which starts on the left. It stays at the top
 * of the window while the table's top is scrolled away, and hides while the
 * table is out of view.
 */
export const placeToolbar = (element: HTMLElement, anchor: ToolbarAnchor) => {
  // measured at the window's left edge, since where it stands now limits
  // its width, e.g. while table mode makes it wider
  element.style.left = "0px";
  const { width, height } = element.getBoundingClientRect();
  const top = Math.max(anchor.top - height - TOOLBAR_GAP, TOOLBAR_TOP);
  element.hidden =
    anchor.bottom < TOOLBAR_TOP + height || anchor.top > window.innerHeight;
  const left = Math.max(
    TOOLBAR_GAP,
    Math.min(anchor.right - width, window.innerWidth - TOOLBAR_GAP - width),
  );
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
};
