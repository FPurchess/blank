<script setup lang="ts">
import { computed } from "vue";

import type { CommandIdentifier } from "../../config";
import { tipAttrs } from "../tooltipModel";
import IconGlyph from "./IconGlyph.vue";

// A button that shows only an icon: named for screen readers by `label`, its
// tooltip the label (or `tip`, e.g. the command's longer name) and the
// command's shortcut (or `tipKey`). `pressed`
// makes it a toggle; `focusable: false` keeps it out of the tab order, for
// bars whose keys the editor handles. It's disabled with aria-disabled, so
// it still shows its tooltip; the click is the parent's, which checks.
// Vue reads a missing boolean prop as false, so `pressed` defaults to
// undefined: a button that isn't a toggle has no aria-pressed.
const props = withDefaults(
  defineProps<{
    icon: string;
    label: string;
    tip?: string;
    command?: CommandIdentifier;
    tipKey?: string;
    pressed?: boolean;
    disabled?: boolean;
    focusable?: boolean;
    large?: boolean;
  }>(),
  {
    tip: undefined,
    command: undefined,
    tipKey: undefined,
    pressed: undefined,
    focusable: true,
  },
);

const tip = computed(() =>
  tipAttrs({
    name: props.tip ?? props.label,
    command: props.command,
    key: props.tipKey,
  }),
);
</script>

<template>
  <button
    type="button"
    class="icon-button"
    v-bind="tip"
    :aria-label="label"
    :aria-pressed="pressed"
    :aria-disabled="disabled || undefined"
    :tabindex="focusable ? undefined : -1"
  >
    <IconGlyph :name="icon" :size="large ? 'large' : undefined" />
    <slot />
  </button>
</template>
