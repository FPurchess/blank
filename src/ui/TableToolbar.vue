<script setup lang="ts">
import { computed, onMounted, onUpdated, useTemplateRef } from "vue";

import { placeToolbar } from "../popup";
import type { TableToolbarState } from "../state";
import CaptionField from "./CaptionField.vue";
import { tableModeHint, toolbarEntries } from "./tableToolbarModel";
import ToolbarButton from "./ToolbarButton.vue";

// The toolbar of the table the cursor is in, above the table's right end. Its
// buttons never take the focus: the editor keeps it and handles the keys of
// table mode (src/editor/plugins/tables/tools.ts). Only the caption field
// takes it.
const props = defineProps<{ state: TableToolbarState }>();

const root = useTemplateRef<HTMLElement>("root");
// the items stay the same while scrolling (see tools.ts), and so do the
// entries, which only follow them
const items = computed(() => props.state.items);
const entries = computed(() => toolbarEntries(items.value));
const hint = tableModeHint();

// placed after every render, when .keys has already changed its width.
// placeToolbar owns the position and `hidden`, so the template never binds them
const place = () => placeToolbar(root.value!, props.state.anchor);
onMounted(place);
onUpdated(place);

/**
 * keepFocus keeps the focus in the editor when the toolbar is pressed,
 * except in the caption field
 */
const keepFocus = (event: MouseEvent) => {
  if (!(event.target as Element).closest("form")) event.preventDefault();
};
</script>

<template>
  <div
    id="table-toolbar"
    ref="root"
    class="table-toolbar"
    :class="{ keys: state.keys }"
    role="toolbar"
    aria-label="Table"
    @mousedown="keepFocus"
  >
    <div class="buttons">
      <template v-for="entry in entries" :key="entry.key">
        <ToolbarButton
          v-if="entry.item"
          :item="entry.item"
          :keys="state.keys"
        />
        <span
          v-else
          class="separator"
          role="separator"
          aria-orientation="vertical"
        />
      </template>
    </div>
    <div class="hint">{{ hint }}</div>
    <CaptionField v-if="state.caption" :caption="state.caption" />
  </div>
</template>
