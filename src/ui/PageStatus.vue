<script setup lang="ts">
import { computed } from "vue";

import { pageTops, scrollState } from "../engine/geometry";
import { pageLayoutState, pageViewport } from "../state";
import { pageLabel } from "./pageViewModel";
import { sectionAt } from "./readingLine";

// "Page N of M" in the bottom bar: the page the view shows at its reading
// line, as the outline marks the heading there, among the pages, and how
// many there are. A component of its own, since it changes as the view
// scrolls. Screen readers, which read the text, not the painted pages, are
// told when the view moves to another page, not when typing changes how many
// there are: the live region stays in place, so a change is read out, and
// says only the page.

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
</script>

<template>
  <span v-if="label" id="ui-page-number">{{ label }}</span>
  <span id="ui-page-spoken" class="visually-hidden" role="status">{{
    spoken
  }}</span>
</template>
