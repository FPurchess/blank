<script setup lang="ts">
import { computed, onMounted, onUpdated, useTemplateRef, watch } from "vue";

import { pageEngine } from "../engine/engine";
import { fallbackFonts } from "../engine/fallback";
import { pageScale } from "../engine/geometry";
import { place } from "../popup";
import {
  announce,
  colorMode,
  drawnMath,
  type MathPreviewState,
  theme,
} from "../state";
import { themeColors } from "./pageLayers";
import { paintDisplay } from "./painter/canvas2d";
import { obstacles, previewOf } from "./mathPreviewModel";

// The live preview under inline math while its source is edited: the
// formula as the pages will show it, or what's wrong with it. It takes no
// focus and no clicks, and stays clear of the find panel and the block
// toolbar. An error is announced once typing pauses and it stays the same.
const props = defineProps<{ request: MathPreviewState }>();

const root = useTemplateRef<HTMLElement>("root");
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const shows = computed(() => {
  // set again once the math fonts and the module are there
  void fallbackFonts.value;
  void drawnMath.value;
  return previewOf(props.request.latex);
});

const paint = () => {
  const target = canvas.value;
  const engine = pageEngine;
  const current = shows.value;
  if (!target || !engine || current.kind !== "math") return;
  const { layout } = current;
  const scale = pageScale() ?? 1;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, layout.width * scale);
  const height = Math.max(1, (layout.height + layout.depth) * scale);
  target.style.width = `${width}px`;
  target.style.height = `${height}px`;
  target.width = Math.ceil(width * ratio);
  target.height = Math.ceil(height * ratio);
  const context = target.getContext("2d");
  if (!context) return;
  paintDisplay(
    context,
    layout.display,
    {
      scale,
      ratio,
      x: 0,
      y: 0,
      color: themeColors(theme.value, root.value ?? document.body).text,
    },
    engine,
    () => null,
  );
};

const placeIt = () => {
  if (root.value) {
    place(root.value, props.request.anchor, { avoid: obstacles() });
  }
};
onMounted(() => {
  paint();
  placeIt();
});
onUpdated(() => {
  paint();
  placeIt();
});
// in the ink of another theme
watch([theme, colorMode], paint, { flush: "post" });

// what's wrong, said once it stays the same while typing pauses
const ANNOUNCE_DELAY = 600;
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => (shows.value.kind === "error" ? shows.value.text : null),
  (error) => {
    clearTimeout(timer);
    if (error)
      timer = setTimeout(
        () => announce(error, { quiet: true }),
        ANNOUNCE_DELAY,
      );
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-show="shows.kind !== 'none'"
    id="math-preview"
    ref="root"
    class="math-preview"
    aria-hidden="true"
  >
    <canvas v-if="shows.kind === 'math'" ref="canvas" />
    <p v-else-if="shows.kind === 'error'" class="error">{{ shows.text }}</p>
  </div>
</template>
