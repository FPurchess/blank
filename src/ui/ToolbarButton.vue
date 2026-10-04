<script setup lang="ts">
import { computed } from "vue";

import type { TableToolbarItem } from "../state";
import IconButton from "./components/IconButton.vue";
import { itemLabel } from "./tableToolbarModel";

// A button of the table toolbar. It never takes the focus (tabindex -1, and
// the toolbar keeps presses from moving it), since the editor handles the
// keys. Its props are the item itself, so Vue skips a button whose item
// didn't change while the toolbar follows the scrolling. In table mode its
// tooltip and badge show its key. Its icons are large, which their detail
// needs.
const props = defineProps<{ item: TableToolbarItem; keys: boolean }>();

const label = computed(() => itemLabel(props.item, props.keys));
const run = () => {
  if (props.item.enabled) props.item.run();
};
</script>

<template>
  <IconButton
    :icon="item.icon"
    :label="item.label"
    :tip-key="keys ? item.key : undefined"
    :pressed="item.checked"
    :disabled="!item.enabled"
    :focusable="false"
    large
    :data-id="item.id"
    :aria-label="label"
    @click="run"
  >
    <kbd aria-hidden="true">{{ item.key }}</kbd>
  </IconButton>
</template>
