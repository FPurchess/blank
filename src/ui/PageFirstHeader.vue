<script setup lang="ts">
import { computed } from "vue";

import { editBand } from "../editor/commands/editBand";
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import type { FrameLayout } from "../engine/frames";
import { pageLayoutState } from "../state";
import { bandTitle, firstHeaderPlace } from "./pageViewModel";

// The first page's header in "page ends", right above its text: the marks
// where the pages end show the header of each page after it, and the sheets
// of "pages" show every header themselves. It isn't there when the first
// page has no header.
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
// the header's slots as one string, read from the engine only where the
// header shows, and again only when its version changes
const slots = computed(() => {
  const engine = pageEngine;
  void version.value;
  if (!engine || !here.value) return "";
  return engine.bands(0).slice(0, 3).join("\u0000");
});
const parts = computed(() => slots.value.split("\u0000"));
const shown = computed(() => parts.value.some(Boolean));

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
    <span v-for="(slot, index) in parts" :key="index">{{ slot }}</span>
  </div>
</template>
