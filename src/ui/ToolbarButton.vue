<script setup lang="ts">
import { computed } from "vue";

import type { ToolbarItem } from "../state";
import IconButton from "./components/IconButton.vue";
import { itemLabel } from "./tableToolbarModel";

// A button of a toolbar. Its props are the item itself, so Vue skips a
// button whose item didn't change while the toolbar follows the scrolling or
// the typing. On the table and block toolbars it never takes the focus
// (tabindex -1, and the toolbar keeps presses from moving it), since the
// editor handles the keys; on the formatting toolbar `tabindex` puts it in
// the toolbar's one tab stop. In table mode its tooltip and badge show its
// key; with `tipKeys`, its tooltip shows the key always, as on the block
// toolbar; a command's shortcut shows otherwise. Its icons are large, which
// their detail needs, unless `large` is false.
const props = withDefaults(
  defineProps<{
    item: ToolbarItem;
    keys: boolean;
    tipKeys?: boolean;
    tabindex?: number;
    large?: boolean;
  }>(),
  { tabindex: -1, large: true },
);

const label = computed(() => itemLabel(props.item, props.keys));
const run = () => {
  if (props.item.enabled) props.item.run();
};
</script>

<template>
  <IconButton
    :icon="item.icon"
    :label="item.tip ?? item.label"
    :command="item.command"
    :tip-key="keys || tipKeys ? item.key : undefined"
    :pressed="item.checked"
    :disabled="!item.enabled"
    :large="large"
    :data-id="item.id"
    :aria-label="label"
    :tabindex="tabindex"
    @click="run"
  >
    <kbd v-if="item.key" aria-hidden="true">{{ item.key }}</kbd>
  </IconButton>
</template>
