<script setup lang="ts">
import { computed } from "vue";

import { caretPage, pageTops, scrollState } from "../engine/geometry";
import { useEditor } from "../editor/handle";
import {
  headings,
  pageLayoutState,
  pageScrollRequest,
  pageViewport,
} from "../state";
import { pageLabel } from "./pageViewModel";
import { sectionAt } from "./readingLine";
import { useMenuButton } from "./composables/useMenuButton";
import { firstHeadings, pageMenuItems } from "./statusBarModel";
import StatusItem from "./StatusItem.vue";

// "Page N of M" in the bottom bar: the page the view shows at its reading
// line, as the outline marks the heading there, among the pages, and how
// many there are. A component of its own, since it changes as the view
// scrolls. A click opens a menu of the pages, each with the first heading on
// it, which goes to that page. Screen readers, which read the text, not the
// painted pages, are told when the view moves to another page, not when
// typing changes how many there are: the live region stays in place, so a
// change is read out, and says only the page.

// how far below the top of the view a page goes to start, above the reading
// line, so the counter then reads that page
const PAGE_JUMP_ROOM = 16;

const editor = useEditor();

// where each page starts, once per layout, not per scroll
const tops = computed(() => pageTops());
const position = computed(() => {
  void pageViewport.value;
  const layout = pageLayoutState.value;
  const starts = tops.value;
  const state = scrollState();
  if (!layout || !starts?.length || !state) return null;
  return {
    page: sectionAt(starts, state.top, state.height, state.max) + 1,
    pages: layout.pages,
  };
});
const label = computed(() => (position.value ? pageLabel(position.value) : ""));
const spoken = computed(() =>
  position.value ? `Page ${position.value.page}` : "",
);

const menu = useMenuButton(() => editor.focus());

const goTo = (page: number) => {
  pageScrollRequest.value = {
    page: page - 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    at: PAGE_JUMP_ROOM,
  };
};

const toggleMenu = (event: MouseEvent) =>
  menu.toggle(
    event,
    pageMenuItems(
      firstHeadings(pageLayoutState.value?.pages ?? 0, headings.value, (pos) =>
        caretPage(pos + 1),
      ),
      goTo,
    ),
  );
</script>

<template>
  <StatusItem
    v-if="label"
    id="ui-page-number"
    tip="Go to page"
    aria-haspopup="menu"
    :aria-expanded="menu.isOpen.value"
    @click="toggleMenu"
    >{{ label }}</StatusItem
  >
  <span id="ui-page-spoken" class="visually-hidden" role="status">{{
    spoken
  }}</span>
</template>
