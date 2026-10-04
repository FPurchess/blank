<script setup lang="ts">
import { computed, onUnmounted, shallowRef, useTemplateRef, watch } from "vue";

import { CommandIdentifier } from "../config";
import {
  scrollState,
  scrollTops,
  scrollToHeading,
  scrollViewBy,
} from "../engine/geometry";
import { listenOnWindow } from "../scope";
import {
  blocksPaneOpen,
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
import SidePaneHead from "./components/SidePaneHead.vue";
import { useBodyClass } from "./composables/useBodyClass";
import { useDismiss } from "./composables/useDismiss";
import { useWindowWidth } from "./composables/useWindowWidth";
import { hoverIntent } from "./hoverIntent";
import OutlineEntry from "./OutlineEntry.vue";
import { tipAttrs } from "./tooltipModel";
import { blocksDock } from "./blocksPaneModel";
import {
  freeRight,
  layoutWidth,
  listShape,
  OUTLINE_DOCK,
  outlinePlacement,
  wheelPixels,
} from "./outlineModel";
import { sectionAt } from "./readingLine";

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

const windowWidth = useWindowWidth();

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
      layoutWidth(
        windowWidth.value,
        scrollbar.value,
        blocksDock(blocksPaneOpen.value, windowWidth.value),
      ),
      pageLayoutState.value,
      pageView.value,
      engineMissing.value,
    ),
  ),
);
const open = computed(
  () => place.value === "beside" || place.value === "docked",
);
const shape = computed(() => listShape(open.value, outlinePeek.value));

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
// color in Pages
useBodyClass("outline-docked", () => place.value === "docked");
useBodyClass("outline-desk", () => pageView.value === "pages");

// a wide window shows the outline open or not at all, never floating
watch(windowWidth, (width) => {
  if (width >= OUTLINE_BREAKPOINT && outlinePeek.value === "sticky")
    outlinePeek.value = null;
});

// a click elsewhere closes the list a click opened
useDismiss(
  () => [root.value],
  () => {
    if (outlinePeek.value === "sticky") outlinePeek.value = null;
  },
);

// the peek opens as the pointer reaches the dashes and closes a moment after
// it left them and the list, which it can reach on the way
const peek = hoverIntent({
  openAfter: 0,
  closeAfter: PEEK_GRACE,
  // the open list isn't a peek, so putting it away leaves none behind
  open: () => {
    if (!open.value) outlinePeek.value ??= "hover";
  },
  close: () => {
    if (outlinePeek.value === "hover") outlinePeek.value = null;
  },
});

const jump = (index: number) => {
  const heading = headings.value[index];
  if (heading) scrollToHeading(heading.pos);
  if (outlinePeek.value === "sticky") outlinePeek.value = null;
};

const collapse = () => {
  if (open.value) outlinePinned.value = false;
  outlinePeek.value = null;
};

const onWheel = (event: WheelEvent) =>
  scrollViewBy(wheelPixels(event, window.innerHeight));

// the list, open or floating, keeps the current heading in sight, scrolling
// its entries only, never the window (they're positioned, so the offsets are
// theirs)
watch(
  [current, shape],
  () => {
    const element = list.value;
    if (shape.value === "peek" || !element) return;
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
  peek.cancel();
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
    :aria-labelledby="shape === 'peek' ? undefined : 'outline-title'"
    :class="place"
    :style="{ '--scrollbar': `${scrollbar}px` }"
    @mousedown.prevent
  >
    <!-- hidden while the list floats over them -->
    <div
      v-if="place === 'dashes' && outlinePeek !== 'sticky'"
      class="outline-dashes"
      role="button"
      tabindex="-1"
      aria-label="Outline"
      :aria-expanded="!!outlinePeek"
      v-bind="dashesTip"
      @mouseenter="peek.enter"
      @mouseleave="peek.leave"
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
      class="outline-list"
      :class="shape"
      @mouseenter="peek.enter"
      @mouseleave="peek.leave"
    >
      <!-- a pane has a head, a peek is only a glance -->
      <SidePaneHead
        v-if="shape !== 'peek'"
        title="Outline"
        title-id="outline-title"
        hide-icon="x"
        hide-label="Hide outline"
        :command="CommandIdentifier.VIEW_OUTLINE"
        :focusable="false"
        @hide="collapse"
      />
      <div ref="list" class="outline-entries">
        <OutlineEntry
          v-for="(entry, index) in entries"
          :key="entry.index"
          :entry="entry"
          :current="index === current"
          @jump="jump"
        />
      </div>
    </div>
  </nav>
</template>
