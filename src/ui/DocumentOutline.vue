<script setup lang="ts">
import { computed, onUnmounted, shallowRef, useTemplateRef, watch } from "vue";

import { CommandIdentifier } from "../config";
import {
  scrollState,
  scrollTops,
  scrollToText,
  scrollViewBy,
} from "../engine/geometry";
import { listenOnWindow } from "../scope";
import {
  engineMissing,
  headings,
  OUTLINE_BREAKPOINT,
  outlineEntries,
  outlinePeek,
  outlinePinned,
  pageLayoutState,
  pageView,
  pageViewport,
  toggleOutline,
} from "../state";
import IconButton from "./components/IconButton.vue";
import { useBodyClass } from "./composables/useBodyClass";
import OutlineEntry from "./OutlineEntry.vue";
import { tipAttrs } from "./tooltipModel";
import {
  freeRight,
  OUTLINE_DOCK,
  outlinePlacement,
  wheelPixels,
} from "./outlineModel";
import { READING_LINE, sectionAt } from "./readingLine";

// The outline: the document's headings as dashes at the right edge, which
// open into a list of them on hover or a click; a click on a heading scrolls
// to it and leaves the cursor where it is. It stays open beside the pages
// from OUTLINE_BREAKPOINT on, and never takes the focus, so the keys keep
// writing.

// how long the list stays after the pointer leaves it, to reach it from the
// dashes
const PEEK_GRACE = 200;

const root = useTemplateRef<HTMLElement>("root");
const list = useTemplateRef<HTMLElement>("list");
const entries = outlineEntries;

const windowWidth = shallowRef(window.innerWidth);
listenOnWindow("resize", () => (windowWidth.value = window.innerWidth));

// the page view's scrollbar, which the outline keeps clear of; the same
// number while scrolling, so nothing that depends on it follows the scroll.
// The room right of the view is the dock's too while the list is docked,
// which no scrollbar is as wide as.
const scrollbar = computed(() => {
  const viewport = pageViewport.value;
  if (!viewport) return 0;
  const right = Math.max(
    0,
    windowWidth.value - (viewport.left + viewport.width),
  );
  return right >= OUTLINE_DOCK ? right - OUTLINE_DOCK : right;
});

const place = computed(() =>
  outlinePlacement(
    entries.value.length,
    outlinePinned.value,
    windowWidth.value,
    freeRight(
      windowWidth.value - scrollbar.value,
      pageLayoutState.value,
      pageView.value,
      engineMissing.value,
    ),
  ),
);
const open = computed(
  () => place.value === "beside" || place.value === "docked",
);

// where each heading starts, once per layout, not per scroll. Without the
// engine the editor's own layout follows the document and the window's
// width, which the geometry can't track, so they're read here.
const tops = computed(() => {
  void engineMissing.value;
  void windowWidth.value;
  const all = headings.value;
  return scrollTops(entries.value.map((entry) => all[entry.index].pos + 1));
});

// without the engine the window scrolls, which pageViewport doesn't follow;
// with it, the window never scrolls
const windowScroll = shallowRef(0);
let scrolled: number | undefined;
listenOnWindow("scroll", () => {
  scrolled ??= requestAnimationFrame(() => {
    scrolled = undefined;
    windowScroll.value = window.scrollY;
  });
});

// the entry of the section the view shows
const current = computed(() => {
  void pageViewport.value;
  void windowScroll.value;
  const state = scrollState();
  return state ? sectionAt(tops.value, state.top, state.height, state.max) : 0;
});

// the page view gives up its right for the docked list, on the desk's
// colour in Pages
useBodyClass("outline-docked", () => place.value === "docked");
useBodyClass("outline-desk", () => pageView.value === "pages");

// a wide window shows the outline open or not at all, never floating
watch(windowWidth, (width) => {
  if (width >= OUTLINE_BREAKPOINT && outlinePeek.value === "sticky")
    outlinePeek.value = null;
});

// a click elsewhere closes the list a click opened
listenOnWindow(
  "pointerdown",
  (event) => {
    if (
      outlinePeek.value === "sticky" &&
      !root.value?.contains(event.target as Node)
    )
      outlinePeek.value = null;
  },
  true,
);

let leaving: ReturnType<typeof setTimeout> | undefined;
const peekIn = () => {
  clearTimeout(leaving);
  // the open list isn't a peek, so putting it away leaves none behind
  if (!open.value) outlinePeek.value ??= "hover";
};
const peekOut = () => {
  clearTimeout(leaving);
  if (outlinePeek.value !== "hover") return;
  leaving = setTimeout(() => {
    if (outlinePeek.value === "hover") outlinePeek.value = null;
  }, PEEK_GRACE);
};

const jump = (index: number) => {
  const heading = headings.value[index];
  if (heading) scrollToText(heading.pos + 1, READING_LINE);
  if (outlinePeek.value === "sticky") outlinePeek.value = null;
};

const collapse = () => {
  if (open.value) outlinePinned.value = false;
  outlinePeek.value = null;
};

const onWheel = (event: WheelEvent) =>
  scrollViewBy(wheelPixels(event, window.innerHeight));

// the open list keeps the current heading in sight, scrolling itself only,
// never the window
watch(
  [current, place],
  () => {
    const element = list.value;
    if (!open.value || !element) return;
    const shown = element.querySelector<HTMLElement>(".outline-entry.current");
    if (!shown) return;
    const top = shown.offsetTop;
    const bottom = top + shown.offsetHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight)
      element.scrollTop = bottom - element.clientHeight;
  },
  { flush: "post" },
);

onUnmounted(() => {
  clearTimeout(leaving);
  if (scrolled !== undefined) cancelAnimationFrame(scrolled);
});

// the dashes and the ×, with the shortcut that shows and hides the outline
const dashesTip = computed(() =>
  tipAttrs({ name: "Outline", command: CommandIdentifier.VIEW_OUTLINE }),
);
</script>

<template>
  <!-- presses keep the focus in the editor, so the keys keep writing -->
  <nav
    v-if="place !== 'hidden'"
    id="outline"
    ref="root"
    aria-label="Outline"
    :class="place"
    :style="{ '--scrollbar': `${scrollbar}px` }"
    @mousedown.prevent
  >
    <div
      v-if="place === 'dashes'"
      class="outline-dashes"
      v-bind="dashesTip"
      @mouseenter="peekIn"
      @mouseleave="peekOut"
      @click="toggleOutline(windowWidth)"
      @wheel.passive="onWheel"
    >
      <span
        v-for="(entry, index) in entries"
        :key="entry.index"
        class="outline-dash"
        :class="[`level-${entry.level}`, { current: index === current }]"
      />
    </div>
    <div
      v-if="open || outlinePeek"
      ref="list"
      class="outline-list"
      :class="{ peek: !open }"
      @mouseenter="peekIn"
      @mouseleave="peekOut"
    >
      <div v-if="open || outlinePeek === 'sticky'" class="outline-head">
        <span class="outline-title">Outline</span>
        <IconButton
          class="outline-collapse"
          icon="x"
          label="Hide outline"
          :command="CommandIdentifier.VIEW_OUTLINE"
          :focusable="false"
          @click="collapse"
        />
      </div>
      <OutlineEntry
        v-for="(entry, index) in entries"
        :key="entry.index"
        :entry="entry"
        :current="index === current"
        @jump="jump"
      />
    </div>
  </nav>
</template>
