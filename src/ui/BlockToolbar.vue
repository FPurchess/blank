<script setup lang="ts">
import { onMounted, onUpdated, useTemplateRef } from "vue";

import { placeToolbar } from "../popup";
import type { BlockToolbarState, ToolbarItem } from "../state";
import IconButton from "./components/IconButton.vue";
import IconGlyph from "./components/IconGlyph.vue";

// The toolbar of the content block the cursor is in or on, above the
// block's right end, as the table toolbar sits on its table
// (src/editor/plugins/blockTools.ts): what the block is, then its buttons,
// whose tooltips show the keys that do the same. Its buttons never take the
// focus.
const props = defineProps<{ state: BlockToolbarState }>();

const root = useTemplateRef<HTMLElement>("root");
// placeToolbar owns the position and `hidden`, so the template never binds
// them
const place = () => placeToolbar(root.value!, props.state.anchor);
onMounted(place);
onUpdated(place);

const run = (item: ToolbarItem) => {
  if (item.enabled) item.run();
};
</script>

<template>
  <div
    id="block-toolbar"
    ref="root"
    class="toolbar block-toolbar"
    role="toolbar"
    :aria-label="state.label"
    @mousedown.prevent
  >
    <span class="block-title">
      <IconGlyph :name="state.icon" />
      <span class="block-name">{{ state.label }}</span>
    </span>
    <span class="separator" aria-hidden="true"></span>
    <IconButton
      v-for="item in state.items"
      :key="item.id"
      :icon="item.icon"
      :label="item.tip ?? item.label"
      :aria-label="item.label"
      :tip-key="item.key"
      :disabled="!item.enabled"
      :focusable="false"
      :data-id="item.id"
      @click="run(item)"
    />
  </div>
</template>
