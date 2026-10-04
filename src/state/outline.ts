import { computed, shallowRef } from "vue";

import { headings } from "./headings";
import { announce } from "./messages";

// The outline beside the pages (src/ui/DocumentOutline.vue): the document's
// headings as dashes at the right edge, which open into a list of them.
// It never takes the focus, so it isn't part of uiTakesFocus.

// from this window width on, the outline can stay open beside the pages;
// below it, it opens floating over them
export const OUTLINE_BREAKPOINT = 1000;

// the outline shows once a document has this many headings, as Notion's does
export const MIN_HEADINGS = 2;

// whether the user keeps the outline open, kept across restarts (see
// storage.ts); it shows open only from OUTLINE_BREAKPOINT on
export const outlinePinned = shallowRef(false);

// the list floating over the pages, null while it's closed: "hover" while
// the pointer is over the dashes or the list, "sticky" after a click on the
// dashes or the shortcut on a narrow window, until a click elsewhere, a
// jump or the shortcut closes it. Never kept.
export type OutlinePeek = "hover" | "sticky" | null;
export const outlinePeek = shallowRef<OutlinePeek>(null);

// a heading the outline lists, by its index in `headings`
export interface OutlineItem {
  index: number;
  level: number;
  text: string;
}

// the entries of the last headings, by index, so an entry stays the same
// object while its level and text do, e.g. while typing above it moves it
let kept: OutlineItem[] = [];

// the headings the outline lists. The same entries while they stay the
// same, so the outline re-renders none of them while typing moves the
// headings.
export const outlineEntries = computed<readonly OutlineItem[]>(() => {
  const next: OutlineItem[] = [];
  headings.value.forEach((heading, index) => {
    const before = kept[index];
    next[index] =
      before?.level === heading.level && before.text === heading.text
        ? before
        : { index, level: heading.level, text: heading.text };
  });
  kept = next;
  return next;
});

/**
 * toggleOutline opens or closes the outline: from OUTLINE_BREAKPOINT on it
 * stays open beside the pages, on a narrow window it floats over them
 * @param width the window's width
 */
export const toggleOutline = (width = window.innerWidth) => {
  if (outlineEntries.value.length < MIN_HEADINGS) {
    announce("The outline shows once there are two headings");
    return;
  }
  let open: boolean;
  if (width >= OUTLINE_BREAKPOINT) {
    outlinePinned.value = !outlinePinned.value;
    outlinePeek.value = null;
    open = outlinePinned.value;
  } else {
    outlinePeek.value = outlinePeek.value === "sticky" ? null : "sticky";
    open = outlinePeek.value !== null;
  }
  announce(open ? "Outline shown" : "Outline hidden");
};
