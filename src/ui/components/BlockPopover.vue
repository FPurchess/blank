<script setup lang="ts">
import { onMounted, onUpdated, useTemplateRef } from "vue";

import { place } from "../../popup";
import type { BoxAnchor } from "../../state";
import { useDismiss } from "../composables/useDismiss";
import { anchorOf, SETTINGS_BUTTON } from "../tocPopoverModel";

// The settings of a block below the block toolbar's settings button (or the
// block, while the button doesn't show): a table of contents', a
// diagram's. They change the block at once; Esc, Enter in a text field, a
// press elsewhere or resizing the window close them, and the focus goes back
// to the block. A press on the settings button is theirs: it closes them
// through the button. Not on the window's blur: WebKitGTK shows the list of
// a select as a menu of its own, which takes the window's focus.
const props = defineProps<{
  id: string;
  title: string;
  anchor: BoxAnchor;
}>();
const emit = defineEmits<{ close: [] }>();

const root = useTemplateRef<HTMLElement>("root");

const placeIt = () =>
  place(root.value!, anchorOf(props.anchor), { align: "end" });
onMounted(() => {
  placeIt();
  // its first control
  root
    .value!.querySelector<HTMLElement>(
      'select, input, button:not([tabindex="-1"])',
    )
    ?.focus();
});
onUpdated(placeIt);

const close = () => emit("close");

// Enter in a text field closes them
const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
    event.preventDefault();
    close();
  }
};

useDismiss(() => [root.value, document.querySelector(SETTINGS_BUTTON)], close, {
  escape: true,
  resize: true,
});
</script>

<template>
  <div
    :id="id"
    ref="root"
    class="block-popover"
    role="dialog"
    :aria-labelledby="`${id}-title`"
    @keydown="onKeyDown"
  >
    <h2 :id="`${id}-title`">{{ title }}</h2>
    <slot />
  </div>
</template>
