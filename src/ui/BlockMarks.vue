<script setup lang="ts">
import { NodeSelection } from "prosemirror-state";
import { computed } from "vue";

import { useEditor } from "../editor/handle";
import { pageDropGap, pageHoverBlock } from "../state";
import {
  dropLineOf,
  hoverBoxesOf,
  lineStyle,
  NO_BOXES,
  styleOf,
} from "./blockMarksModel";

// Marks of content blocks over the pages: a line where a dragged block
// drops, between two blocks, with a dot at its start, and a hairline around
// the block under the pointer. They follow the layout and the scrolling, and
// take no presses.
const editor = useEditor();

// only while something shows do they follow the editor's state, which
// changes on every key
const line = computed(() =>
  pageDropGap.value === null
    ? null
    : dropLineOf(editor.state.value.doc, pageDropGap.value),
);

const hovered = computed(() => {
  if (pageHoverBlock.value === null || pageDropGap.value !== null)
    return NO_BOXES;
  const { doc, selection } = editor.state.value;
  const selected =
    selection instanceof NodeSelection
      ? { from: selection.from, to: selection.to }
      : null;
  return hoverBoxesOf(doc, pageHoverBlock.value, selected);
});
</script>

<template>
  <div
    v-for="(box, index) in hovered"
    :key="index"
    class="block-hover"
    :style="styleOf(box)"
  ></div>
  <div v-if="line" class="block-drop-line" :style="lineStyle(line)"></div>
</template>
