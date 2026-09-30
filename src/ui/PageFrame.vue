<script setup lang="ts">
import { computed, onMounted, useTemplateRef, watch } from "vue";

import { editBand } from "../editor/commands/editBand";
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import type { Band } from "../layout/bands";
import { imagesLoaded, loadedImage } from "../engine/images";
import { bootMark, record } from "../engine/perf";
import { pageLayoutState, path, theme } from "../state";
import { paintPage } from "./paintPage";
import { bandTitle, endMark } from "./pageViewModel";

// One page of the page view: a canvas the engine's layout of the page is
// painted into, and in "page ends" the mark where the page ends. Its props
// are plain values, so it paints again only when one of them changes.
const props = defineProps<{
  page: number;
  version: number;
  // the next page's version, for the mark, -1 for the last page
  nextVersion: number;
  top: number;
  left: number;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  sheet: boolean;
}>();

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const editor = useEditor();

// a click on a header or footer opens its strip, which takes the focus
const openBand = (band: Band) => editor.run(editBand(band), { focus: false });

// the header and footer margins of a sheet, in pixels
const margins = computed(() => {
  const state = pageLayoutState.value;
  if (!props.sheet || !state) return null;
  return {
    top: state.margins.top * props.scale,
    bottom: state.margins.bottom * props.scale,
  };
});

const paint = () => {
  const element = canvas.value;
  const engine = pageEngine;
  if (!element || !engine) return;
  const start = performance.now();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.ceil(props.width * ratio);
  const height = Math.ceil(props.height * ratio);
  if (element.width !== width) element.width = width;
  if (element.height !== height) element.height = height;
  const context = element.getContext("2d");
  if (!context) return;
  const color = getComputedStyle(element).color;
  paintPage(context, engine.display(props.page, props.version), {
    scale: props.scale,
    ratio,
    x: props.x,
    y: props.y,
    color,
    glyph: (font, id) => engine.glyph(font, id),
    unitsPerEm: (font) => engine.unitsPerEm(font),
    image: (src) => loadedImage(src, path.value)?.image ?? null,
  });
  record("paint", performance.now() - start);
  bootMark("pages");
};

onMounted(paint);
watch(
  () => [
    props.version,
    props.width,
    props.height,
    props.scale,
    props.x,
    props.y,
    theme.value,
    imagesLoaded.value,
  ],
  paint,
  { flush: "post" },
);

// what the mark at the page's end shows
const mark = computed(() => {
  const engine = pageEngine;
  if (props.sheet || !engine) return null;
  void props.version;
  const next = props.nextVersion >= 0 ? engine.bands(props.page + 1) : null;
  return endMark(props.page, engine.bands(props.page), next);
});
</script>

<template>
  <div
    class="page-frame"
    :class="{ sheet }"
    :data-page="page + 1"
    :style="{
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      height: `${height}px`,
    }"
  >
    <canvas
      ref="canvas"
      class="page-canvas"
      aria-hidden="true"
      :style="{ width: `${width}px`, height: `${height}px` }"
    />
    <template v-if="margins">
      <div
        class="page-band header"
        :title="bandTitle('header')"
        aria-hidden="true"
        :style="{ height: `${margins.top}px` }"
        @mousedown.prevent.stop
        @click="openBand('header')"
      />
      <div
        class="page-band footer"
        :title="bandTitle('footer')"
        aria-hidden="true"
        :style="{ height: `${margins.bottom}px` }"
        @mousedown.prevent.stop
        @click="openBand('footer')"
      />
    </template>
    <div v-if="mark" class="page-end" aria-hidden="true">
      <div
        class="band footer"
        :title="bandTitle('footer')"
        @mousedown.prevent.stop
        @click="openBand('footer')"
      >
        <span v-for="(slot, index) in mark.footer" :key="index">{{
          slot
        }}</span>
      </div>
      <div class="line">
        <span v-if="mark.number" class="number">{{ mark.number }}</span>
      </div>
      <div
        v-if="nextVersion >= 0"
        class="band header"
        :title="bandTitle('header')"
        @mousedown.prevent.stop
        @click="openBand('header')"
      >
        <span v-for="(slot, index) in mark.header" :key="index">{{
          slot
        }}</span>
      </div>
    </div>
  </div>
</template>
