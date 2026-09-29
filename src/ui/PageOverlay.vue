<script setup lang="ts">
import { computed } from "vue";

import { pageCaret, pageSelection } from "../state";
import { type FrameLayout, onDesk } from "../engine/frames";

// The caret and the selection over the painted pages. Apart from the pages,
// so a moving caret renders only this.
const props = defineProps<{ layout: FrameLayout }>();

const caret = computed(() =>
  pageCaret.value ? onDesk(props.layout, pageCaret.value) : null,
);
const rects = computed(() =>
  pageSelection.value.flatMap((rect, index) => {
    const placed = onDesk(props.layout, rect);
    return placed ? [{ ...placed, key: index }] : [];
  }),
);
</script>

<template>
  <div
    v-for="rect in rects"
    :key="rect.key"
    class="page-selection"
    :style="{
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    }"
  />
  <div
    v-if="caret"
    :key="`${caret.left},${caret.top}`"
    class="page-caret"
    :style="{
      left: `${caret.left}px`,
      top: `${caret.top}px`,
      height: `${caret.height}px`,
    }"
  />
</template>
