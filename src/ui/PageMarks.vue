<script setup lang="ts">
import { computed } from "vue";

import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import { type FrameLayout, onDesk } from "../engine/frames";
import { pageLayoutState } from "../state";
import { marksOn } from "./pageMarks";

// The underlines of misspelled words and the labels of page breaks on the
// pages in view, see pageMarks.ts. They follow the editor's state, so they
// change as the spell check finds words, without painting the pages again.
const props = defineProps<{ layout: FrameLayout; pages: number[] }>();
const editor = useEditor();

const marks = computed(() => {
  const engine = pageEngine;
  // the layout the marks are measured on
  void pageLayoutState.value;
  if (!engine) return [];
  return marksOn(engine, editor.state.value, props.pages).flatMap((mark) => {
    const placed = onDesk(props.layout, mark);
    return placed ? [{ ...placed, kind: mark.kind, key: mark.key }] : [];
  });
});
</script>

<template>
  <div
    v-for="mark in marks"
    :key="mark.key"
    :class="mark.kind === 'spelling' ? 'page-misspelling' : 'page-break-mark'"
    aria-hidden="true"
    :style="{
      left: `${mark.left}px`,
      top: `${mark.top}px`,
      width: `${mark.width}px`,
      height: `${mark.height}px`,
    }"
  />
</template>
