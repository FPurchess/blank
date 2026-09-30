<script setup lang="ts">
import { computed } from "vue";

import { type FrameLayout, onDesk } from "../engine/frames";
import { caretLine } from "./pageViewModel";
import {
  pageCaret,
  pageComposition,
  pageDropCaret,
  pageNodeSelection,
  pageSelection,
  type PageRect,
} from "../state";

// The caret and the selection on the painted pages: the text or cells
// selected, the outline of a selected node, and the text an input method is
// composing. Apart from the pages, so a moving caret renders only this. The
// caret shows while the editor has the focus, and the selection dims without
// it, as in the webview's own text.
// The page view shows it in two layers: the selection under the text (the
// pages are transparent but for their text), the rest over it.
const props = defineProps<{
  layout: FrameLayout;
  layer: "under" | "over";
  // device pixels per CSS pixel, which the caret is drawn on
  ratio: number;
  // whether the editor has the focus, see PageView.vue
  focused: boolean;
}>();

const placed = (rects: PageRect[]) =>
  rects.flatMap((rect, index) => {
    const box = onDesk(props.layout, rect);
    return box ? [{ ...box, key: index }] : [];
  });

const caret = computed(() => {
  const box =
    pageCaret.value && props.layer === "over"
      ? onDesk(props.layout, pageCaret.value)
      : null;
  return box && { ...box, ...caretLine(box.left, props.ratio) };
});
// where dragged text would drop, as a caret that doesn't blink
const drop = computed(() => {
  const box =
    pageDropCaret.value && props.layer === "over"
      ? onDesk(props.layout, pageDropCaret.value)
      : null;
  return box && { ...box, ...caretLine(box.left, props.ratio) };
});

const under = computed(() => props.layer === "under");
// with the focus the pages paint the selection over their text themselves
// (PageFrame.vue), without it dimmed under it here
const rects = computed(() =>
  under.value && !props.focused ? placed(pageSelection.value) : [],
);
const nodes = computed(() =>
  under.value ? [] : placed(pageNodeSelection.value),
);
const composing = computed(() =>
  under.value ? [] : placed(pageComposition.value),
);

const box = (rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}) => ({
  left: `${rect.left}px`,
  top: `${rect.top}px`,
  width: `${rect.width}px`,
  height: `${rect.height}px`,
});
</script>

<template>
  <div
    v-for="rect in rects"
    :key="rect.key"
    class="page-selection"
    :class="{ inactive: !focused }"
    :style="box(rect)"
  />
  <div
    v-for="rect in nodes"
    :key="rect.key"
    class="page-node-selection"
    :style="box(rect)"
  />
  <div
    v-for="rect in composing"
    :key="rect.key"
    class="page-composition"
    :style="box(rect)"
  />
  <div
    v-if="drop"
    class="page-caret page-drop-caret"
    :style="{
      left: `${drop.left}px`,
      width: `${drop.width}px`,
      top: `${drop.top}px`,
      height: `${drop.height}px`,
    }"
  />
  <div
    v-if="caret && focused"
    :key="`${caret.left},${caret.top}`"
    class="page-caret"
    :style="{
      left: `${caret.left}px`,
      width: `${caret.width}px`,
      top: `${caret.top}px`,
      height: `${caret.height}px`,
    }"
  />
</template>
