<script setup lang="ts">
import { onMounted, onUpdated, useTemplateRef } from "vue";

import { placeToolbar } from "../popup";
import type { BlockToolbarState } from "../state";
import ToolbarButton from "./ToolbarButton.vue";

// The toolbar of the content block the cursor is in or on, above the
// block's right end, as the table toolbar sits on its table
// (src/editor/plugins/blockTools.ts). Its buttons never take the focus.
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
    <div class="buttons">
      <ToolbarButton
        v-for="item in state.items"
        :key="item.id"
        :item="item"
        :keys="false"
      />
    </div>
  </div>
</template>
