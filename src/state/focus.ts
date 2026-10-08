import { computed, shallowRef } from "vue";

import { blocksPaneFocused } from "./blocksPane";
import { focusTakingDialogs } from "./dialogs";
import { findFocused } from "./find";
import { contextMenu, tableToolbar } from "./popups";
import { tabRowFocused } from "./tabs";
import { toolbarFocused } from "./toolbar";

// uiTakesFocus is whether a part of the UI holds the focus, which the editor
// leaves it: the dialogs, the header and footer strips, the context menu and
// the caption field of the table toolbar, and the blocks pane, the tab row,
// the formatting toolbar and the find panel while the focus is in them. The
// pickers and the table and block toolbars' buttons never take it, since the
// editor handles their keys.
export const uiTakesFocus = computed(
  () =>
    focusTakingDialogs.some((request) => request.value !== null) ||
    contextMenu.value !== null ||
    blocksPaneFocused.value ||
    tabRowFocused.value ||
    toolbarFocused.value ||
    findFocused.value ||
    !!tableToolbar.value?.caption,
);

// where each part of the window comes in the order F6 moves through, after
// the text
export const FOCUS_ORDER = { tabs: 10, toolbar: 20, find: 30 } as const;

// A part of the window F6 moves the focus to, e.g. the tab row, after the
// editor, in the order of `order` (see cycleFocus)
export interface FocusStop {
  id: string;
  order: number;
  // gives the part the focus
  focus(): void;
  // whether `element` is in the part
  has(element: Element | null): boolean;
}

// the parts shown now, in their order
const focusStops = shallowRef<readonly FocusStop[]>([]);

/**
 * registerFocusStop adds `stop` to the parts F6 moves through, while it's
 * shown
 * @returns what removes it again
 */
export const registerFocusStop = (stop: FocusStop) => {
  focusStops.value = [...focusStops.value, stop].sort(
    (a, b) => a.order - b.order,
  );
  return () => {
    focusStops.value = focusStops.value.filter((other) => other !== stop);
  };
};

/**
 * focusStop gives the part `id` the focus, if it's shown, e.g. the toolbar
 * for Alt-F10
 */
export const focusStop = (id: string) => {
  focusStops.value.find((stop) => stop.id === id)?.focus();
};

/**
 * cycleFocus moves the focus from the part that holds `active` to the next
 * one, or the previous one for -1: the editor, then each registered part,
 * and round to the editor again
 */
export const cycleFocus = (
  direction: 1 | -1,
  active: Element | null,
  focusEditor: () => void,
) => {
  const stops = focusStops.value;
  // 0 is the editor, which holds the focus when no part does
  const at = stops.findIndex((stop) => stop.has(active)) + 1;
  const next = (at + direction + stops.length + 1) % (stops.length + 1);
  if (next === 0) focusEditor();
  else stops[next - 1].focus();
};
