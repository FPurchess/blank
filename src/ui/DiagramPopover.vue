<script setup lang="ts">
import { shallowRef } from "vue";

import {
  closeDialog,
  diagramPopover,
  type DiagramPopoverRequest,
} from "../state";
import BlockPopover from "./components/BlockPopover.vue";
import OptionGroup from "./components/OptionGroup.vue";
import { WIDTH_OPTIONS, widthChosen, widthWritten } from "./widthOptions";

// The settings of a diagram (Shift+Enter or the toolbar's settings button,
// see src/editor/commands/contentBlocks.ts): how wide it is, its caption,
// and what it shows, for screen readers, the PDF and Word.
const props = defineProps<{ request: DiagramPopoverRequest }>();

const width = shallowRef(widthChosen(props.request.values.width));
const caption = shallowRef(props.request.values.caption);
const alt = shallowRef(props.request.values.alt);

const apply = () =>
  props.request.apply({
    width: widthWritten(width.value, props.request.values.width),
    caption: caption.value.trim(),
    alt: alt.value.trim(),
  });
const choose = (chosen: string | string[]) => {
  width.value = String(chosen);
  apply();
};
const close = () => closeDialog(diagramPopover, props.request.close);
</script>

<template>
  <BlockPopover
    id="diagram-popover"
    title="Diagram"
    :anchor="request.anchor"
    @close="close"
  >
    <OptionGroup
      id="diagram-popover-width"
      name="width"
      label="Width"
      :options="WIDTH_OPTIONS"
      :model-value="width"
      @update:model-value="choose"
    />
    <label for="diagram-popover-caption">Caption</label>
    <input
      id="diagram-popover-caption"
      v-model="caption"
      type="text"
      autocomplete="off"
      @input="apply"
    />
    <label for="diagram-popover-alt">Description</label>
    <input
      id="diagram-popover-alt"
      v-model="alt"
      type="text"
      autocomplete="off"
      :placeholder="request.label"
      @input="apply"
    />
  </BlockPopover>
</template>
