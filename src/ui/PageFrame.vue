<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  useTemplateRef,
  watch,
} from "vue";

import { editBand } from "../editor/commands/editBand";
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import type { Band } from "../layout/bands";
import { imagesLoaded, loadedImage } from "../engine/images";
import { bootMark, record } from "../engine/perf";
import { pageLayoutState, path, theme } from "../state";
import { bitmapKey, pageBitmaps, paintQueue } from "./pageBitmaps";
import { paintPage } from "./paintPage";
import { bandTitle, endMark } from "./pageViewModel";

// One page of the page view: a canvas the engine's layout of the page is
// painted into, and in "page ends" the mark where the page ends. Its props
// are plain values, so it paints again only when one of them changes, and
// then from the bitmap it was painted into before, if there is one (see
// pageBitmaps.ts).
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
  // just outside the view, which paints after the pages in view
  near: boolean;
  // device pixels per CSS pixel
  ratio: number;
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

// what the canvas shows now, so the same isn't drawn twice
let shown = "";

/**
 * paintInto paints the page into a context of `width` × `height` device
 * pixels
 */
const paintInto = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  color: string,
  ratio: number,
) => {
  const engine = pageEngine;
  if (!engine) return;
  const start = performance.now();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  paintPage(
    context as CanvasRenderingContext2D,
    engine.display(props.page, props.version),
    {
      scale: props.scale,
      ratio,
      x: props.x,
      y: props.y,
      color,
      glyph: (font, id) => engine.glyph(font, id),
      unitsPerEm: (font) => engine.unitsPerEm(font),
      image: (src) => loadedImage(src, path.value)?.image ?? null,
    },
  );
  record("paint", performance.now() - start);
  bootMark("pages");
};

// a page has its own place in the queue, so a newer request replaces one
// that hasn't run yet
const job = computed(() => `page:${props.page}`);

/**
 * paint shows the page: drawn from its bitmap if it was painted before, or
 * else painted in the next frame, the pages in view first
 */
const paint = () => {
  const element = canvas.value;
  if (!element || !pageEngine) return;
  const { ratio } = props;
  // a device pixel for each pixel of the canvas, which is shown at exactly
  // its size, so nothing scales it and blurs the text
  const width = Math.round(props.width * ratio);
  const height = Math.round(props.height * ratio);
  if (element.width !== width || element.height !== height) {
    element.width = width;
    element.height = height;
    element.style.width = `${width / ratio}px`;
    element.style.height = `${height / ratio}px`;
    shown = "";
  }
  const key = bitmapKey({
    page: props.page,
    version: props.version,
    width,
    height,
    scale: props.scale,
    ratio,
    x: props.x,
    y: props.y,
    theme: theme.value,
    images: imagesLoaded.value,
  });
  if (key === shown) return;
  const context = element.getContext("2d");
  if (!context) return;
  const cached = pageBitmaps.get(key);
  if (cached) {
    context.clearRect(0, 0, width, height);
    context.drawImage(cached.image, 0, 0);
    shown = key;
    return;
  }
  // without bitmaps, e.g. in tests: right away
  if (typeof createImageBitmap === "undefined") {
    paintInto(context, colorOf(element), ratio);
    shown = key;
    return;
  }
  // until then the canvas shows what it showed, or the empty sheet
  paintQueue.request({
    key: job.value,
    priority: props.near ? 1 : 0,
    run: () => {
      // unless the page changed meanwhile, which asks again
      if (!canvas.value || element.width !== width || element.height !== height)
        return;
      context.clearRect(0, 0, width, height);
      paintInto(context, colorOf(element), ratio);
      shown = key;
    },
  });
};

/**
 * keep keeps what the canvas shows for when the page comes into view again,
 * as it leaves: a copy only of the pages that go, not of every paint
 */
const keep = () => {
  const element = canvas.value;
  if (!element || !shown || typeof createImageBitmap === "undefined") return;
  if (pageBitmaps.get(shown)) return;
  const key = shown;
  const { width, height } = element;
  createImageBitmap(element).then(
    (bitmap) =>
      pageBitmaps.set(key, {
        image: bitmap,
        width,
        height,
        close: () => bitmap.close(),
      }),
    () => {},
  );
};

onMounted(paint);
onBeforeUnmount(keep);
onUnmounted(() => paintQueue.cancel(job.value));
watch(
  () => [
    props.version,
    props.width,
    props.height,
    props.scale,
    props.x,
    props.y,
    props.near,
    props.ratio,
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
    <!-- its size is set when it's painted, in device pixels -->
    <canvas ref="canvas" class="page-canvas" aria-hidden="true" />
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
