<script setup lang="ts">
import { computed } from "vue";

import type { TableToolbarItem } from "../state";
import IconGlyph from "./components/IconGlyph.vue";
import { itemLabel } from "./tableToolbarModel";

// A button of the table toolbar. It never takes the focus (tabindex -1, and
// the toolbar keeps presses from moving it), since the editor handles the
// keys. Its props are the item itself, so Vue skips a button whose item
// didn't change while the toolbar follows the scrolling.
const props = defineProps<{ item: TableToolbarItem; keys: boolean }>();

const label = computed(() => itemLabel(props.item, props.keys));
const run = () => {
  if (props.item.enabled) props.item.run();
};
</script>

<template>
  <button
    type="button"
    tabindex="-1"
    :data-id="item.id"
    :title="label"
    :aria-label="label"
    :aria-disabled="!item.enabled"
    :aria-pressed="item.checked"
    @click="run"
  >
    <IconGlyph :name="item.icon" />
    <kbd aria-hidden="true">{{ item.key }}</kbd>
  </button>
</template>
