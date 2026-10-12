<script setup lang="ts">
import { computed } from "vue";

import { focusFreed, removeStamp, repeatStamp } from "../pdf/stampActions";
import type { Stamp } from "../pdf/stampModel";
import IconButton from "./components/IconButton.vue";
import type { Rect } from "./rect";
import { toolbarSpot } from "./stampOverlayModel";

// The toolbar of the stamp selected on a PDF's page, above it (below it at
// the top of the desk), a popover: Remove, and for initials "Repeat on
// every page". It comes after its stamp in the DOM, so Tab reaches it from
// the stamp, and Esc goes back to the stamp.
const props = defineProps<{
  stamp: Stamp;
  // where the stamp shows on the desk
  box: Rect;
}>();

const spot = computed(() => toolbarSpot(props.box));
const stampElement = () => document.getElementById(`stamp-${props.stamp.id}`);

// as Delete on the stamp: the place it filled takes the focus, else the
// pages
const remove = () => {
  const removed = removeStamp(props.stamp.id);
  if (removed) focusFreed(removed.place);
};
const repeat = () => repeatStamp(props.stamp.id);
const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  stampElement()?.focus();
};
</script>

<template>
  <div
    class="stamp-toolbar"
    role="toolbar"
    aria-label="Stamp"
    :style="{ left: `${spot.left}px`, top: `${spot.top}px` }"
    @keydown="onKeydown"
    @pointerdown.stop
  >
    <IconButton
      v-if="stamp.kind === 'initials'"
      icon="pages"
      label="Repeat on every page"
      :pressed="!!stamp.repeat"
      @click="repeat"
    />
    <IconButton icon="trash" label="Remove" tip-key="Delete" @click="remove" />
  </div>
</template>
