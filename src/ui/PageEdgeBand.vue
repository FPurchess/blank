<script setup lang="ts">
import { computed } from "vue";

import { editBand } from "../editor/commands/editBand";
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import type { FrameLayout } from "../engine/frames";
import type { Band } from "../layout/bands";
import { pageBandParts } from "../layout/placeholders";
import { pageFields, pageLayout, pageLayoutState } from "../state";
import BandSlots from "./BandSlots.vue";
import { bandTitle, firstHeaderPlace, lastFooterPlace } from "./pageViewModel";

// The first page's header right above its text in "page ends", or the last
// page's footer right below it: the marks where the pages end show the
// header of the page after each and the footer of the page before, and the
// last page doesn't end in a mark, since the text goes on there. The sheets
// of "pages" show every header and footer themselves. It isn't there when
// that page has no such band written, so an empty document shows nothing but
// the caret; a placeholder that comes out empty shows its name.
const props = defineProps<{ band: Band; layout: FrameLayout }>();
const editor = useEditor();

const header = computed(() => props.band === "header");
const place = computed(() =>
  header.value ? firstHeaderPlace(props.layout) : lastFooterPlace(props.layout),
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

// a double click opens its strip, which takes the focus
const open = () => editor.run(editBand(props.band), { focus: false });
</script>

<template>
  <div
    v-if="place && shown"
    :class="header ? 'page-first-header' : 'page-last-footer'"
    aria-hidden="true"
    :title="bandTitle(band)"
    :style="{
      left: `${place.left}px`,
      top: `${place.top}px`,
      width: `${place.width}px`,
      height: `${place.height}px`,
    }"
    @dblclick="open"
  >
    <BandSlots :slots="slots" />
  </div>
</template>
