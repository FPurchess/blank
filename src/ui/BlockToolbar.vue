<script setup lang="ts">
import { onMounted, onUpdated, useTemplateRef } from "vue";

import { placeToolbar } from "../popup";
import type { BlockToolbarState } from "../state";
import IconGlyph from "./components/IconGlyph.vue";
import ToolbarButton from "./ToolbarButton.vue";

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
    <span class="separator" role="separator" aria-orientation="vertical" />
    <ToolbarButton
      v-for="item in state.items"
      :key="item.id"
      :item="item"
      :keys="false"
      tip-keys
    />
  </div>
</template>
