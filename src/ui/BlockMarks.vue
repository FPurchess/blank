<script setup lang="ts">
import { NodeSelection } from "prosemirror-state";
import { computed } from "vue";

import { useEditor } from "../editor/handle";
import { pageDropGap, pageHoverBlock } from "../state";
import { dropLineOf, hoverBoxesOf, styleOf } from "./blockMarksModel";

// Marks of content blocks over the pages: a line where a dragged block
// drops, between two blocks, with a dot at its start, and a hairline around
// the block under the pointer. They follow the layout and the scrolling, and
// take no presses.
const editor = useEditor();

const line = computed(() =>
  dropLineOf(editor.state.value.doc, pageDropGap.value),
);

const hovered = computed(() => {
  const { doc, selection } = editor.state.value;
  const selected =
    selection instanceof NodeSelection
      ? { from: selection.from, to: selection.to }
      : null;
  return pageDropGap.value === null
    ? hoverBoxesOf(doc, pageHoverBlock.value, selected)
    : [];
});
</script>

<template>
  <div
    v-for="(box, index) in hovered"
    :key="index"
    class="block-hover"
    :style="styleOf(box)"
  ></div>
  <div
    v-if="line"
    class="block-drop-line"
    :style="{
      left: `${line.left}px`,
      top: `${line.y - 1}px`,
      width: `${line.right - line.left}px`,
    }"
  ></div>
</template>
