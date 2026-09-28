<script setup lang="ts">
import { computed, onMounted, onUpdated, useTemplateRef } from "vue";

import {
  choosePickerSize,
  sizeLabel,
} from "../editor/commands/table/pickerSize";
import { place } from "../popup";
import type { TablePickerState } from "../state";
import { pickerCells, shownSize } from "./tablePickerModel";

// The picker for the size of a new table, below the cursor. The editor keeps
// the focus and handles its keys (src/editor/plugins/tables/picker.ts), so a
// press anywhere on it keeps the focus there. The mouse chooses the size of
// the cell under it and inserts it on a click.
const props = defineProps<{ state: TablePickerState }>();

const root = useTemplateRef<HTMLElement>("root");
const shown = computed(() => shownSize(props.state));
const cells = computed(() => pickerCells(shown.value.cols, shown.value.rows));

// placed after every render: when it opens, when the cursor moves and when
// the grid grows, so it stays below the cursor and in view
const placePicker = () => place(root.value!, props.state.anchor);
onMounted(placePicker);
onUpdated(placePicker);
</script>

<template>
  <div
    id="table-picker"
    ref="root"
    class="table-picker"
    role="dialog"
    aria-label="Insert table"
    @mousedown.prevent
  >
    <div
      class="grid"
      :style="{ gridTemplateColumns: `repeat(${shown.cols}, auto)` }"
    >
      <span
        v-for="cell in cells"
        :key="cell.key"
        class="cell"
        :class="{
          header: cell.row === 1,
          chosen: cell.col <= state.cols && cell.row <= state.rows,
        }"
        :data-col="cell.col"
        :data-row="cell.row"
        @mouseover="choosePickerSize(cell.col, cell.row)"
        @click="state.submit(cell.col, cell.row)"
      />
    </div>
    <div class="size" aria-live="polite">
      {{ sizeLabel(state.cols, state.rows) }}
    </div>
    <div class="hint">Arrows or mouse: size · Enter or click: insert</div>
  </div>
</template>
