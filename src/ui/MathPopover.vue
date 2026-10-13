<script setup lang="ts">
import { shallowRef, watch } from "vue";

import { closeDialog, mathPopover, type MathPopoverRequest } from "../state";
import BlockPopover from "./components/BlockPopover.vue";
import SwitchControl from "./components/SwitchControl.vue";

// The settings of display math (Shift+Enter or the toolbar's settings
// button, see src/editor/commands/contentBlocks.ts): whether it is numbered,
// (1), (2)… at the right, in the order of the document.
const props = defineProps<{ request: MathPopoverRequest }>();

const numbered = shallowRef(props.request.values.numbered);
watch(numbered, (value) => props.request.apply({ numbered: value }));
const close = () => closeDialog(mathPopover, props.request.close);
</script>

<template>
  <BlockPopover
    id="math-popover"
    title="Equation"
    :anchor="request.anchor"
    @close="close"
  >
    <SwitchControl id="math-popover-numbered" v-model="numbered">
      Numbered
    </SwitchControl>
  </BlockPopover>
</template>
