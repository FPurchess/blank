<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef, watch } from "vue";

import { type PageDisplay, pageEngine } from "../engine/engine";
import { imagesLoaded } from "../engine/images";
import type { PrintSheet } from "../engine/types";
import type { Size } from "../print/sheets";
import IconButton from "./components/IconButton.vue";
import { useResizeObserver } from "./composables/useResizeObserver";
import { sizeCanvas } from "./pageLayer";
import { painter } from "./painter";
import { PAPER, PAPER_COLORS } from "./painter/canvas2d";

// The print dialog's preview: one sheet at a time, with the pages placed on
// it as printSheets places them for the print PDF, painted as they print,
// in ink on white paper whatever the theme, without what only the screen
// shows (PageEngine.printDisplay). ‹ › page through the sheets.
const props = defineProps<{
  sheets: readonly PrintSheet[];
  // the size of the document's pages, in points
  page: Size;
  // which sheet shows, e.g. "Page 3 of 5"
  label: string;
}>();
// the sheet shown, by its index
const index = defineModel<number>({ required: true });

const stage = useTemplateRef<HTMLElement>("stage");
// the room the sheet has, in CSS pixels
const room = shallowRef({ width: 0, height: 0 });
const measure = () => {
  const element = stage.value;
  if (!element) return;
  // the stage's padding stays around the sheet
  const style = getComputedStyle(element);
  const padding = (side: "Top" | "Right" | "Bottom" | "Left") =>
    Number.parseFloat(style[`padding${side}`]) || 0;
  room.value = {
    width: element.clientWidth - padding("Left") - padding("Right"),
    height: element.clientHeight - padding("Top") - padding("Bottom"),
  };
};
onMounted(measure);
useResizeObserver(() => [stage.value], measure);

const sheet = computed(() => props.sheets[index.value]);
// CSS pixels per point, so the sheet fills the stage
const scale = computed(() => {
  const shown = sheet.value;
  if (!shown || room.value.width <= 0 || room.value.height <= 0) return 0;
  return Math.min(
    room.value.width / shown.width,
    room.value.height / shown.height,
  );
});
const px = (points: number) => `${points * scale.value}px`;

// what each page prints, read once: the document can't change while the
// dialog is open
const displays = new Map<number, PageDisplay>();
const displayOf = (page: number) => {
  let display = displays.get(page);
  if (!display && pageEngine) {
    display = pageEngine.printDisplay(page);
    displays.set(page, display);
  }
  return display;
};

// the canvas of each page of the sheet, by its place on it (a v-for's ref
// list keeps no order)
const canvases: (HTMLCanvasElement | null)[] = [];
const paint = () => {
  const shown = sheet.value;
  const k = scale.value;
  if (!shown || !k) return;
  const ratio = window.devicePixelRatio || 1;
  shown.placements.forEach((placement, at) => {
    const canvas = canvases[at];
    const display = displayOf(placement.page);
    const surface = canvas && painter.surface(canvas);
    if (!surface || !display) return;
    const s = k * placement.scale;
    sizeCanvas(
      canvas,
      Math.round(props.page.width * s * ratio),
      Math.round(props.page.height * s * ratio),
      ratio,
    );
    painter.paint(surface, display, {
      scale: s,
      ratio,
      x: 0,
      y: 0,
      colors: PAPER_COLORS,
      background: PAPER,
    });
  });
};
// only the sheet shown, again once what it shows, its size or an image
// changed: the same pages placed the same way paint nothing again
const shown = computed(() =>
  sheet.value ? `${JSON.stringify(sheet.value)}@${scale.value}` : "",
);
watch([shown, imagesLoaded], paint, { flush: "post" });

const go = (by: 1 | -1) => {
  const next = index.value + by;
  if (next >= 0 && next < props.sheets.length) index.value = next;
};
defineExpose({ go });
</script>

<template>
  <div class="print-preview" role="group" aria-label="Preview">
    <div ref="stage" class="stage">
      <p v-if="!sheets.length" class="empty">
        No preview until the pages are right
      </p>
      <div
        v-else-if="sheet && scale"
        class="sheet"
        :style="{ width: px(sheet.width), height: px(sheet.height) }"
      >
        <canvas
          v-for="(placement, at) in sheet.placements"
          :key="`${index}:${at}`"
          :ref="(element) => (canvases[at] = element as HTMLCanvasElement)"
          :style="{ left: px(placement.x), top: px(placement.y) }"
        />
      </div>
    </div>
    <div class="pager">
      <IconButton
        icon="chevron-left"
        label="Previous sheet"
        tip-key="PageUp"
        :disabled="index === 0"
        @click="go(-1)"
      />
      <p aria-live="polite">{{ label }}</p>
      <IconButton
        icon="chevron-right"
        label="Next sheet"
        tip-key="PageDown"
        :disabled="index >= sheets.length - 1"
        @click="go(1)"
      />
    </div>
  </div>
</template>
