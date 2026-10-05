<script setup lang="ts">
import { computed } from "vue";

import { pageEngine } from "../engine/engine";
import type { FrameLayout } from "../engine/frames";
import type { Band } from "../layout/bands";
import { pageBandParts } from "../layout/placeholders";
import { pageFields, pageLayout, pageLayoutState } from "../state";
import BandSlots from "./BandSlots.vue";
import { shownAtRest } from "./bandStripsModel";
import BandTarget from "./BandTarget.vue";
import {
  edgeHintPlace,
  firstHeaderPlace,
  lastFooterPlace,
} from "./pageViewModel";

// The first page's header right above its text in "page ends", or the last
// page's footer right below it: the marks where the pages end show the
// header of the page after each and the footer of the page before, and the
// last page doesn't end in a mark, since the text goes on there. The sheets
// of "pages" show every header and footer themselves. It isn't there when
// that page has no such band written, so an empty document shows nothing but
// the caret, and, while the pointer is there, the hint to add one when the
// document has none (BandTarget.vue); a placeholder that comes out empty
// shows its name.
const props = defineProps<{ band: Band; layout: FrameLayout }>();

const header = computed(() => props.band === "header");
const place = computed(() =>
  header.value ? firstHeaderPlace(props.layout) : lastFooterPlace(props.layout),
);
// where the hint to add one goes while the document has none
const hint = computed(() =>
  shownAtRest(pageLayout.value.settings, props.band) === undefined
    ? edgeHintPlace(props.layout, props.band)
    : null,
);
// whether it shows here at all, which changes far less than where
const here = computed(() => place.value !== null);
const pages = computed(() => pageLayoutState.value?.pages ?? 1);
// the page it belongs to, and that page's band version, which changes only
// with its header and footer, not with every key typed
const page = computed(() => (header.value ? 0 : pages.value - 1));
const version = computed(
  () => pageLayoutState.value?.bandVersions[page.value] ?? 0,
);
// its slots, read from the engine only where it shows, and again only when
// the page, its version, the page setup or the placeholders' values change
const slots = computed(() => {
  const engine = pageEngine;
  void version.value;
  if (!engine || !here.value) return [];
  const parts = pageBandParts(
    pageLayout.value.layout,
    page.value,
    pages.value,
    pageFields.value,
    engine.bands(page.value),
  );
  return header.value ? parts.slice(0, 3) : parts.slice(3, 6);
});
const shown = computed(() => slots.value.some((parts) => parts.length));
</script>

<template>
  <BandTarget
    v-if="place && shown"
    :class="header ? 'page-first-header' : 'page-last-footer'"
    :band="band"
    :page="page"
    :adding="false"
    :style="{
      left: `${place.left}px`,
      top: `${place.top}px`,
      width: `${place.width}px`,
      height: `${place.height}px`,
    }"
  >
    <BandSlots :slots="slots" />
  </BandTarget>
  <BandTarget
    v-else-if="hint"
    class="page-edge-hint"
    :band="band"
    :page="page"
    :adding="true"
    :style="{
      left: `${hint.left}px`,
      top: `${hint.top}px`,
      width: `${hint.width}px`,
      height: `${hint.height}px`,
    }"
  />
</template>
