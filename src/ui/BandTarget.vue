<script setup lang="ts">
import { computed } from "vue";

import { NAMES } from "../bandStrip";
import { useEditor } from "../editor/handle";
import type { Band } from "../layout/bands";
import { bandCommand, bandPage, openBandOn } from "./bandStripsModel";
import { tipAttrs } from "./tooltipModel";

// A header or footer where the pages show it, which a click opens for
// editing on its page: outlined under the pointer over the band the engine
// painted (or the text the default slot shows), or, while the document has
// no such band, "+ Header" or "+ Footer", which shows where the pointer is
// on the margin. On a sheet it takes the whole margin. Out of the tab order
// like the pages; the keys open it with the command.
const props = defineProps<{
  band: Band;
  // the page, counted from 0
  page: number;
  // whether the document has no such band yet, to add one
  adding: boolean;
}>();

const editor = useEditor();
const name = computed(() =>
  props.adding ? `Add a ${props.band}` : `Edit the ${props.band}`,
);
const tip = computed(() =>
  tipAttrs({ name: name.value, command: bandCommand(props.band) }),
);
const open = () => openBandOn(editor, props.band, props.page);
</script>

<template>
  <button
    type="button"
    :class="adding ? 'band-hint' : 'band-target'"
    tabindex="-1"
    :data-band-page="bandPage(band, page + 1)"
    :aria-label="name"
    v-bind="tip"
    @click="open"
  >
    <span v-if="adding" class="band-hint-chip">+ {{ NAMES[band] }}</span>
    <slot v-else />
  </button>
</template>
