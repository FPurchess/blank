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
import { BLEED } from "../engine/frames";
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import type { Band } from "../layout/bands";
import { imagesLoaded, loadedImage } from "../engine/images";
import { FIELD_NAMES, pageBandParts } from "../layout/placeholders";
import { pageFields, pageLayout, pageLayoutState, path, theme } from "../state";
import BandSlots from "./BandSlots.vue";
import { layerOf } from "./pageLayer";
import { shownMarks } from "./pageMarks";
import { frameRenders, layerDisplay } from "./pageLayers";
import { bandTitle, endMark, selectedBoxes, sheetSlots } from "./pageViewModel";

// One page of the page view: a canvas the engine's layout of the page is
// painted into, and in "page ends" the mark where the page ends, unless it's
// the last. Its props
// are plain values, so it paints again only when one of them changes, and
// then from the bitmap it was painted into before, if there is one (see
// pageBitmaps.ts).
const props = defineProps<{
  page: number;
  // the versions of its text and of its header and footer, which change
  // apart (see pageLayers.ts)
  bodyVersion: number;
  bandVersion: number;
  // the next page's band version, for the mark, -1 for the last page, which
  // has none
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
  // the selection's rectangles on the page while the editor has the focus,
  // see selectedOn; "" for none
  selected: string;
  // the underlines of misspelled words and the labels of page breaks on the
  // page, see PageMarksMemo; "" for none
  marks: string;
  // device pixels per CSS pixel
  ratio: number;
}>();

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const headerCanvas = useTemplateRef<HTMLCanvasElement>("headerCanvas");
const footerCanvas = useTemplateRef<HTMLCanvasElement>("footerCanvas");
const selectedCanvas = useTemplateRef<HTMLCanvasElement>("selectedCanvas");
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
// where the text starts in a frame of "page ends", which the header and
// footer of a page-end mark line up with
const bandInset = computed(() => `${BLEED * props.scale}px`);

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
const body = layerOf({
  frame: props,
  name: "body",
  layer: "body",
  element: () => canvas.value,
  version: () => props.bodyVersion,
  images: () => imagesShown.value,
  strip: () => null,
});
// the header and footer on a sheet, in strips as high as the margins they
// sit in; "page ends" shows them where each page ends, as text
const header = layerOf({
  frame: props,
  name: "header",
  layer: "bands",
  element: () => headerCanvas.value,
  version: () => props.bandVersion,
  images: () => "",
  strip: () => ({ top: 0, height: marginTop.value }),
});
const footer = layerOf({
  frame: props,
  name: "footer",
  layer: "bands",
  element: () => footerCanvas.value,
  version: () => props.bandVersion,
  images: () => "",
  strip: () => ({
    top: props.height - marginBottom.value,
    height: marginBottom.value,
  }),
});
const bands = [header, footer];
// the selected text over the selection, in colours of its own, which only
// a page with a selection has, painted again when it changes (see
// src/scss/themes.test.ts for the contrast)
const selectedText = layerOf({
  frame: props,
  name: "selected",
  layer: "body",
  element: () => selectedCanvas.value,
  version: () => props.bodyVersion,
  images: () => imagesShown.value,
  strip: () => null,
  look: (colors) => ({
    key: props.selected,
    color: colors.selectedText,
    within: selectedBoxes(props.selected),
    fill: colors.selection,
  }),
});
const layers = [body, ...bands, selectedText];

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
watch(
  () => [props.selected, props.bodyVersion, imagesShown.value, ...shownAt()],
  selectedText.paint,
  { flush: "post" },
);
watch(
  () => [
    props.bandVersion,
    props.sheet,
    marginTop.value,
    marginBottom.value,
    ...shownAt(),
  ],
  () => bands.forEach((band) => band.paint()),
  { flush: "post" },
);

// how often the frames render, for the tests that keep one from rendering
// when nothing it shows changed; only in the builds tests run
if (import.meta.env.DEV || __TEST_HOOKS__)
  onUpdated(() => frameRenders.count++);

// the marks over the text, placed on the frame, keyed by where they are on
// the page, so a mark that stays keeps its element
const marked = computed(() =>
  shownMarks(props.marks).map((mark) => ({
    ...mark,
    left: (mark.x - props.x) * props.scale,
    top: (mark.y - props.y) * props.scale,
    width: mark.width * props.scale,
    height: mark.height * props.scale,
  })),
);

// what the mark at the page's end shows, which follows the bands of the
// page and of the next one, not their text; none after the last page, whose
// footer PageEdgeBand.vue shows
const pages = computed(() => pageLayoutState.value?.pages ?? 1);
// what the six slots of a page's header and footer show, with the
// placeholders that come out empty named (see src/layout/placeholders.ts)
const bandsOf = (page: number) =>
  pageBandParts(
    pageLayout.value.layout,
    page,
    pages.value,
    pageFields.value,
    pageEngine!.bands(page),
  );
const mark = computed(() => {
  const engine = pageEngine;
  if (props.sheet || !engine || props.nextBandVersion < 0) return null;
  void props.bandVersion;
  void props.nextBandVersion;
  return endMark(
    props.page,
    bandsOf(props.page),
    bandsOf(props.page + 1),
    pageLayout.value.layout,
  );
});
// the slots of a sheet's header and footer whose placeholders come out
// empty, named over the bands the engine painted
// the page's size and margins, as text, which stays the same while typing
// publishes a new layout
const pageBox = computed(() => {
  const state = pageLayoutState.value;
  if (!state) return "";
  const { top, right, bottom, left } = state.margins;
  return [state.width, state.height, top, right, bottom, left].join(",");
});
const named = computed(() => {
  if (!props.sheet || !pageEngine || !pageBox.value) return [];
  void props.bandVersion;
  const [width, height, top, right, bottom, left] = pageBox.value
    .split(",")
    .map(Number);
  return sheetSlots(
    bandsOf(props.page),
    { width, height, margins: { top, right, bottom, left } },
    props.scale,
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
      v-if="selected"
      ref="selectedCanvas"
      class="page-canvas page-selected"
      aria-hidden="true"
    />
    <template v-if="sheet">
      <canvas
        ref="headerCanvas"
        class="page-canvas page-bands header"
        aria-hidden="true"
      />
      <canvas
        ref="footerCanvas"
        class="page-canvas page-bands footer"
        aria-hidden="true"
      />
    </template>
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
    <div
      v-if="mark"
      class="page-end"
      aria-hidden="true"
      :style="{ '--band-inset': bandInset }"
    >
      <div
        class="band footer"
        :title="bandTitle('footer')"
        @dblclick="openBand('footer')"
      >
        <BandSlots :slots="mark.footer" />
      </div>
      <div class="line">
        <span v-if="mark.number" class="number">{{ mark.number }}</span>
      </div>
      <div
        class="band header"
        :title="bandTitle('header')"
        @dblclick="openBand('header')"
      >
        <BandSlots :slots="mark.header" />
      </div>
    </div>
    <div
      v-for="band in named"
      :key="`band-${band.key}`"
      class="page-band-names"
      :class="[band.slot, { named: band.named }]"
      aria-hidden="true"
      :style="{
        left: `${band.left}px`,
        top: `${band.top}px`,
        width: `${band.width}px`,
        height: `${band.height}px`,
        fontSize: `${band.size}px`,
      }"
    >
      <template v-for="(part, at) in band.parts" :key="at"
        ><span v-if="'text' in part" class="painted">{{ part.text }}</span
        ><span v-else class="at"
          ><em
            class="band-placeholder"
            :class="{ spaced: part.spaced }"
            :data-field="part.field"
            >{{ FIELD_NAMES[part.field] }}</em
          ></span
        ></template
      >
    </div>
    <div
      v-for="over in marked"
      :key="over.key"
      :class="over.kind === 'spelling' ? 'page-misspelling' : 'page-break-mark'"
      aria-hidden="true"
      :style="{
        left: `${over.left}px`,
        top: `${over.top}px`,
        width: `${over.width}px`,
        height: `${over.height}px`,
      }"
    />
  </div>
</template>
