<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  useTemplateRef,
  watch,
} from "vue";

import { editBand } from "../editor/commands/editBand";
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import type { Band } from "../layout/bands";
import { imagesLoaded, loadedImage } from "../engine/images";
import { bootMark, record } from "../engine/perf";
import { pageLayout, pageLayoutState, path, theme } from "../state";
import { bitmapKey, engineId, pageBitmaps, paintQueue } from "./pageBitmaps";
import { painter, type Surface } from "./painter";
import { frameRenders, type Layer, layerDisplay } from "./pageLayers";
import { bandTitle, endMark } from "./pageViewModel";

// One page of the page view: a canvas the engine's layout of the page is
// painted into, and in "page ends" the mark where the page ends. Its props
// are plain values, so it paints again only when one of them changes, and
// then from the bitmap it was painted into before, if there is one (see
// pageBitmaps.ts).
const props = defineProps<{
  page: number;
  // the versions of its text and of its header and footer, which change
  // apart (see pageLayers.ts)
  bodyVersion: number;
  bandVersion: number;
  // the next page's band version, for the mark, -1 for the last page
  nextBandVersion: number;
  top: number;
  left: number;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  sheet: boolean;
  // just outside the view, which paints after the pages in view
  near: boolean;
  // device pixels per CSS pixel
  ratio: number;
}>();

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const bandsCanvas = useTemplateRef<HTMLCanvasElement>("bandsCanvas");
const editor = useEditor();

// a double click on a header or footer opens its strip, which takes the
// focus, as in Word; a single one there leaves the text as it is
const openBand = (band: Band) => editor.run(editBand(band), { focus: false });

// the header and footer margins of a sheet, in pixels, 0 where the page
// ends show no margins; numbers, so a layout with the same margins renders
// nothing again
const marginTop = computed(() =>
  props.sheet ? (pageLayoutState.value?.margins.top ?? 0) * props.scale : 0,
);
const marginBottom = computed(() =>
  props.sheet ? (pageLayoutState.value?.margins.bottom ?? 0) * props.scale : 0,
);

// the theme's text colour, read once for each theme
const colors = new Map<string, string>();
const colorOf = (element: HTMLElement) => {
  let color = colors.get(theme.value);
  if (!color) {
    color = getComputedStyle(element).color;
    colors.set(theme.value, color);
  }
  return color;
};

// which of the images the page's text shows are loaded, e.g. "10", so the
// page paints again when one of its own loads, not when any image does
const imagesShown = computed(() => {
  const engine = pageEngine;
  void imagesLoaded.value;
  if (!engine) return "";
  return layerDisplay(engine, "body", props.page, props.bodyVersion)
    .i.map(([src]) => (loadedImage(src, path.value) ? "1" : "0"))
    .join("");
});

/**
 * layerOf paints one layer of the page into its canvas: the text, or the
 * header and footer of a sheet. Each is painted apart, when its own version
 * changes, and kept as a bitmap of its own.
 */
const layerOf = (
  layer: Layer,
  element: () => HTMLCanvasElement | null,
  version: () => number,
  images: () => string,
) => {
  // what the canvas shows now, so the same isn't drawn twice
  let shown = "";
  // the canvas as the painter paints into it, taken when it's there
  let surface: Surface | null = null;
  const surfaceOf = (canvas: HTMLCanvasElement) => {
    if (surface?.canvas !== canvas) {
      if (surface) painter.release(surface);
      surface = painter.surface(canvas);
      shown = "";
    }
    return surface;
  };
  // the layer's canvas is gone, e.g. the bands' in "page ends": nothing of
  // it is kept or painted any more
  const release = () => {
    paintQueue.cancel(job());
    if (surface) painter.release(surface);
    surface = null;
    shown = "";
  };
  // a layer has its own place in the queue, so a newer request replaces one
  // that hasn't run yet
  const job = () => `${layer}:${props.page}`;

  const paintInto = (target: Surface, color: string, ratio: number) => {
    const engine = pageEngine;
    if (!engine) return;
    const start = performance.now();
    painter.paint(target, layerDisplay(engine, layer, props.page, version()), {
      scale: props.scale,
      ratio,
      x: props.x,
      y: props.y,
      color,
    });
    record("paint", performance.now() - start);
    bootMark("pages");
  };

  /**
   * paint shows the layer: drawn from its bitmap if it was painted before,
   * or else painted in the next frame, the pages in view first
   */
  const paint = () => {
    const canvas = element();
    if (!canvas) return release();
    if (!pageEngine) return;
    const { ratio } = props;
    // a device pixel for each pixel of the canvas, which is shown at
    // exactly its size, so nothing scales it and blurs the text
    const width = Math.round(props.width * ratio);
    const height = Math.round(props.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width / ratio}px`;
      canvas.style.height = `${height / ratio}px`;
      shown = "";
    }
    const key = bitmapKey({
      engine: engineId(pageEngine),
      layer,
      page: props.page,
      version: version(),
      width,
      height,
      scale: props.scale,
      ratio,
      x: props.x,
      y: props.y,
      theme: theme.value,
      images: images(),
    });
    if (key === shown) return;
    const target = surfaceOf(canvas);
    if (!target) return;
    const cached = pageBitmaps.get(key);
    if (cached) {
      painter.show(target, cached);
      shown = key;
      return;
    }
    // without snapshots, e.g. in tests: right away
    if (!painter.snapshots) {
      paintInto(target, colorOf(canvas), ratio);
      shown = key;
      return;
    }
    // until then the canvas shows what it showed, or the empty sheet
    paintQueue.request({
      key: job(),
      priority: props.near ? 1 : 0,
      run: () => {
        // unless the page changed meanwhile, which asks again
        if (
          element() !== canvas ||
          canvas.width !== width ||
          canvas.height !== height
        )
          return;
        paintInto(target, colorOf(canvas), ratio);
        shown = key;
      },
    });
  };

  /**
   * keep keeps what the canvas shows for when the page comes into view
   * again, as it leaves: a copy only of the pages that go, not of every
   * paint
   */
  const keep = () => {
    const kept = surface;
    if (!element() || !shown || !kept) return release();
    if (!painter.snapshots || pageBitmaps.get(shown)) return release();
    const key = shown;
    paintQueue.cancel(job());
    surface = null;
    // freed once the copy is taken
    painter.snapshot(kept).then(
      (snapshot) => {
        if (snapshot) pageBitmaps.set(key, snapshot);
        painter.release(kept);
      },
      () => painter.release(kept),
    );
  };

  return { paint, keep };
};

const body = layerOf(
  "body",
  () => canvas.value,
  () => props.bodyVersion,
  () => imagesShown.value,
);
// the header and footer on a sheet; "page ends" shows them where each page
// ends, as text
const bands = layerOf(
  "bands",
  () => bandsCanvas.value,
  () => props.bandVersion,
  () => "",
);
const layers = [body, bands];

onMounted(() => layers.forEach((layer) => layer.paint()));
// what they show is kept for when the page comes back, and their canvases
// freed
onBeforeUnmount(() => layers.forEach((layer) => layer.keep()));
// what changes either layer
const shownAt = () => [
  props.width,
  props.height,
  props.scale,
  props.x,
  props.y,
  props.near,
  props.ratio,
  theme.value,
];
watch(() => [props.bodyVersion, imagesShown.value, ...shownAt()], body.paint, {
  flush: "post",
});
watch(() => [props.bandVersion, props.sheet, ...shownAt()], bands.paint, {
  flush: "post",
});

// how often the frames render, for the tests that keep one from rendering
// when nothing it shows changed
onUpdated(() => frameRenders.count++);

// what the mark at the page's end shows, which follows the bands of the
// page and of the next one, not their text
const mark = computed(() => {
  const engine = pageEngine;
  if (props.sheet || !engine) return null;
  void props.bandVersion;
  const next = props.nextBandVersion >= 0 ? engine.bands(props.page + 1) : null;
  return endMark(
    props.page,
    engine.bands(props.page),
    next,
    pageLayout.value.layout,
  );
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
    <!-- its size is set when it's painted, in device pixels -->
    <canvas ref="canvas" class="page-canvas" aria-hidden="true" />
    <canvas
      v-if="sheet"
      ref="bandsCanvas"
      class="page-canvas page-bands"
      aria-hidden="true"
    />
    <template v-if="sheet">
      <div
        class="page-band header"
        :title="bandTitle('header')"
        aria-hidden="true"
        :style="{ height: `${marginTop}px` }"
        @dblclick="openBand('header')"
      />
      <div
        class="page-band footer"
        :title="bandTitle('footer')"
        aria-hidden="true"
        :style="{ height: `${marginBottom}px` }"
        @dblclick="openBand('footer')"
      />
    </template>
    <div v-if="mark" class="page-end" aria-hidden="true">
      <div
        class="band footer"
        :title="bandTitle('footer')"
        @dblclick="openBand('footer')"
      >
        <span v-for="(slot, index) in mark.footer" :key="index">{{
          slot
        }}</span>
      </div>
      <div class="line">
        <span v-if="mark.number" class="number">{{ mark.number }}</span>
      </div>
      <div
        v-if="nextBandVersion >= 0"
        class="band header"
        :title="bandTitle('header')"
        @dblclick="openBand('header')"
      >
        <span v-for="(slot, index) in mark.header" :key="index">{{
          slot
        }}</span>
      </div>
    </div>
  </div>
</template>
