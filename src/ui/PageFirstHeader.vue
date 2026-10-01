<script setup lang="ts">
import { computed } from "vue";

import { editBand } from "../editor/commands/editBand";
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import type { FrameLayout } from "../engine/frames";
import { pageBandParts } from "../layout/placeholders";
import { pageFields, pageLayout, pageLayoutState } from "../state";
import BandSlots from "./BandSlots.vue";
import { bandTitle, firstHeaderPlace } from "./pageViewModel";

// The first page's header in "page ends", right above its text: the marks
// where the pages end show the header of each page after it, and the sheets
// of "pages" show every header themselves. It isn't there when the first
// page has no header written; a placeholder that comes out empty shows its
// name.
const props = defineProps<{ layout: FrameLayout }>();
const editor = useEditor();

const place = computed(() => firstHeaderPlace(props.layout));
// whether it shows here at all, which changes far less than where
const here = computed(() => place.value !== null);
// the first page's band version, which changes only with its header and
// footer, not with every key typed
const version = computed(
  () =>
    pageLayoutState.value?.bandVersions?.[0] ??
    pageLayoutState.value?.versions[0] ??
    0,
);
const pages = computed(() => pageLayoutState.value?.pages ?? 1);
// the header's slots, read from the engine only where the header shows, and
// again only when its version, the page setup or the placeholders' values
// change
const slots = computed(() => {
  const engine = pageEngine;
  void version.value;
  if (!engine || !here.value) return [];
  return pageBandParts(
    pageLayout.value.layout,
    0,
    pages.value,
    pageFields.value,
    engine.bands(0),
  ).slice(0, 3);
});
const shown = computed(() => slots.value.some((parts) => parts.length));

// a double click opens its strip, which takes the focus
const open = () => editor.run(editBand("header"), { focus: false });
</script>

<template>
  <div
    v-if="place && shown"
    class="page-first-header"
    aria-hidden="true"
    :title="bandTitle('header')"
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
