<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  useTemplateRef,
  watch,
} from "vue";

import { BLEED } from "../engine/frames";
import { pageEngine } from "../engine/engine";
import { imagesLoaded, loadedImage } from "../engine/images";
import { isVector } from "../engine/vectors";
import { vectorPictures } from "../state/drawings";
import { FIELD_NAMES } from "../layout/placeholders";
import { pageLayout, pageLayoutState, path, theme } from "../state";
import BandSlots from "./BandSlots.vue";
import { addsBand, pageBands } from "./bandStripsModel";
import BandTarget from "./BandTarget.vue";
import { layerOf } from "./pageLayer";
import { MARK_LOOKS, shownMarks } from "./pageMarks";
import { frameRenders, layerDisplay } from "./pageLayers";
import {
  endMark,
  selectedBoxes,
  sheetSlots,
  sheetTargets,
} from "./pageViewModel";
import { styleOf } from "./rect";

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

// whether the document has no header or footer, which the margins and marks
// then offer to add
const adding = computed(() => ({
  header: addsBand("header"),
  footer: addsBand("footer"),
}));

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
  const shown = layerDisplay(engine, "body", props.page, props.bodyVersion).i;
  // a drawing of Blank's has a picture per ink (src/engine/vectors.ts),
  // so the page paints again when any of them is ready
  const drawings = shown.some(([src]) => isVector(src))
    ? `:${vectorPictures.value}`
    : "";
  return (
    shown
      .map(([src]) =>
        isVector(src) || loadedImage(src, path.value) ? "1" : "0",
      )
      .join("") + drawings
  );
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

// the marks on the text, placed on the frame, keyed by where they are on
// the page, so a mark that stays keeps its element: the matches of find
// under the text, the rest over it
const marked = computed(() =>
  shownMarks(props.marks).map((mark) => ({
    ...mark,
    ...MARK_LOOKS[mark.kind],
    left: (mark.x - props.x) * props.scale,
    top: (mark.y - props.y) * props.scale,
    width: mark.width * props.scale,
    height: mark.height * props.scale,
  })),
);
const under = computed(() => marked.value.filter((mark) => mark.under));
const over = computed(() => marked.value.filter((mark) => !mark.under));

// what the mark at the page's end shows, which follows the bands of the
// page and of the next one, not their text; none after the last page, whose
// footer PageEdgeBand.vue shows
const pages = computed(() => pageLayoutState.value?.pages ?? 1);
const mark = computed(() => {
  if (props.sheet || props.nextBandVersion < 0) return null;
  void props.bandVersion;
  void props.nextBandVersion;
  const bands = pageBands(props.page, pages.value);
  const next = pageBands(props.page + 1, pages.value);
  return bands && next
    ? endMark(props.page, bands, next, pageLayout.value.layout)
    : null;
});
// the page's size and margins, as text, which stays the same while typing
// publishes a new layout
const pageBox = computed(() => {
  const state = pageLayoutState.value;
  if (!state) return "";
  const { top, right, bottom, left } = state.margins;
  return [state.width, state.height, top, right, bottom, left].join(",");
});
const setup = computed(() => {
  if (!pageBox.value) return null;
  const [width, height, top, right, bottom, left] = pageBox.value
    .split(",")
    .map(Number);
  return { width, height, margins: { top, right, bottom, left } };
});
// the slots of a sheet's header and footer whose placeholders come out
// empty, named over the bands the engine painted
const named = computed(() => {
  if (!props.sheet || !setup.value) return [];
  void props.bandVersion;
  const bands = pageBands(props.page, pages.value);
  return bands ? sheetSlots(bands, setup.value, props.scale) : [];
});
// where a sheet's header and footer are in their margins, which a click
// opens, outlined under the pointer
const targets = computed(() =>
  props.sheet && setup.value ? sheetTargets(setup.value, props.scale) : null,
);
</script>

<template>
  <div
    class="page-frame"
    :class="{ sheet }"
    :data-page="page + 1"
    :style="styleOf({ left, top, width, height })"
  >
    <!-- the matches of find, under the text the canvas paints over them -->
    <div
      v-for="shown in under"
      :key="shown.key"
      :class="shown.className"
      aria-hidden="true"
      :style="styleOf(shown)"
    />
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
      <div class="page-band header" :style="{ height: `${marginTop}px` }">
        <BandTarget band="header" :page="page" :adding="adding.header">
          <span
            class="band-target-line"
            :style="styleOf(targets?.header ?? null)"
          />
        </BandTarget>
      </div>
      <div class="page-band footer" :style="{ height: `${marginBottom}px` }">
        <BandTarget band="footer" :page="page" :adding="adding.footer">
          <span
            class="band-target-line"
            :style="styleOf(targets?.footer ?? null)"
          />
        </BandTarget>
      </div>
    </template>
    <div
      v-if="mark"
      class="page-end"
      aria-hidden="true"
      :style="{ '--band-inset': bandInset }"
    >
      <BandTarget
        class="band footer"
        band="footer"
        :page="page"
        :adding="adding.footer"
      >
        <BandSlots :slots="mark.footer" />
      </BandTarget>
      <div class="line">
        <span v-if="mark.number" class="number">{{ mark.number }}</span>
      </div>
      <BandTarget
        class="band header"
        band="header"
        :page="page + 1"
        :adding="adding.header"
      >
        <BandSlots :slots="mark.header" />
      </BandTarget>
    </div>
    <div
      v-for="band in named"
      :key="`band-${band.key}`"
      class="page-band-names"
      :class="[band.slot, { named: band.named }]"
      aria-hidden="true"
      :style="{ ...styleOf(band), fontSize: `${band.size}px` }"
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
      v-for="shown in over"
      :key="shown.key"
      :class="shown.className"
      aria-hidden="true"
      :style="styleOf(shown)"
    />
  </div>
</template>
