<script setup lang="ts">
import { computed } from "vue";

import type { BlockChoice } from "../state";
import { tipAttrs } from "./tooltipModel";
import { formWireframe, type WireBox } from "./blocksPaneModel";

// A tile of the blocks pane: a drawing of the block over its name, its
// description in the tooltip. A form's drawing is its layout; a table of
// contents and a drawing have one of their own. The pane handles its
// presses and keys.
const props = defineProps<{ choice: BlockChoice; current: boolean }>();

// the page the drawing shows, in the units of its viewBox
const WIDTH = 40;
const HEIGHT = 56;

const boxes = computed(() =>
  props.choice.definition
    ? formWireframe(props.choice.definition).map((box: WireBox) => ({
        kind: box.kind,
        x: box.x * WIDTH,
        y: box.y * HEIGHT,
        width: box.width * WIDTH,
        height: box.height * HEIGHT,
      }))
    : [],
);
</script>

<template>
  <button
    type="button"
    class="tile"
    :data-block="choice.id"
    :tabindex="current ? 0 : -1"
    :aria-disabled="choice.disabled || undefined"
    :aria-description="choice.description || undefined"
    v-bind="tipAttrs({ name: choice.description || choice.label })"
  >
    <svg
      class="thumb"
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        class="sheet"
        x="0.5"
        y="0.5"
        :width="WIDTH - 1"
        :height="HEIGHT - 1"
      />
      <template v-if="choice.group === 'contents'">
        <rect class="ink" x="6" y="7" width="16" height="2.5" />
        <g class="lines">
          <path d="M6 16h22 M8 21h20 M8 26h20 M6 31h22 M8 36h20" />
          <path class="dots" d="M32 16h2 M32 21h2 M32 26h2 M32 31h2 M32 36h2" />
        </g>
      </template>
      <template v-else-if="choice.group === 'forms'">
        <rect
          v-for="(box, index) in boxes"
          :key="index"
          :class="['wire', box.kind]"
          :x="box.x"
          :y="box.y"
          :width="box.width"
          :height="box.height"
        />
      </template>
      <g v-else-if="choice.id === 'diagram'" class="lines">
        <rect x="12" y="9" width="16" height="7" rx="1.5" />
        <rect x="12" y="24.5" width="16" height="7" rx="1.5" />
        <rect x="12" y="40" width="16" height="7" rx="3.5" />
        <path d="M20 16v8.5 M20 31.5v8.5" />
      </g>
      <g v-else class="lines">
        <rect x="7" y="18" width="11" height="11" />
        <circle cx="28" cy="23.5" r="5.5" />
        <path d="M13 41l6-9 6 9z" />
      </g>
    </svg>
    <span class="tile-name">{{ choice.label }}</span>
  </button>
</template>
