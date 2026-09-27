import type { Anchor } from "./state";

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
