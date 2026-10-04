<script setup lang="ts">
import { computed } from "vue";

import type { CommandIdentifier } from "../config";
import IconGlyph from "./components/IconGlyph.vue";
import { tipAttrs } from "./tooltipModel";

// An item of the status bar: a button with an optional icon before its text,
// or only an icon, with the props of IconButton. `label` names it for screen
// readers where its text doesn't, `pressed` makes it a toggle. Its tooltip is
// `tip`, or else `label` or the label of `command`, with the command's
// shortcut. It stays out of the tab order unless `focusable`: the bar never
// takes the focus, which stays in the editor. Vue reads a missing boolean prop
// as false, so `pressed` defaults to undefined: an item that isn't a toggle
// has no aria-pressed.
const props = withDefaults(
  defineProps<{
    icon?: string;
    label?: string;
    tip?: string;
    command?: CommandIdentifier;
    pressed?: boolean;
    disabled?: boolean;
    focusable?: boolean;
  }>(),
  {
    icon: undefined,
    label: undefined,
    tip: undefined,
    command: undefined,
    pressed: undefined,
  },
);

const tipped = computed(() =>
  tipAttrs({ name: props.tip ?? props.label, command: props.command }),
);
</script>

<template>
  <button
    type="button"
    class="status-item"
    :class="{ 'icon-only': icon && !$slots.default }"
    v-bind="tipped"
    :aria-label="label"
    :aria-pressed="pressed"
    :aria-disabled="disabled"
    :tabindex="focusable ? undefined : -1"
    @mousedown.prevent
  >
    <IconGlyph v-if="icon" :name="icon" />
    <slot />
  </button>
</template>
