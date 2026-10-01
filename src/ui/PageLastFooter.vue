<script setup lang="ts">
import { computed } from "vue";

import { editBand } from "../editor/commands/editBand";
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import type { FrameLayout } from "../engine/frames";
import { pageLayoutState } from "../state";
import { bandTitle, lastFooterPlace } from "./pageViewModel";

// The last page's footer in "page ends", right below its text, where the
// marks between the pages show the footers of the others: the last page
// doesn't end in a mark, since the text goes on there. It isn't there when
// the last page has no footer, so an empty document shows nothing but the
// caret. The sheets of "pages" show every footer themselves.
const props = defineProps<{ layout: FrameLayout }>();
const editor = useEditor();

const place = computed(() => lastFooterPlace(props.layout));
// whether it shows here at all, which changes far less than where
const here = computed(() => place.value !== null);
// the last page, and its band version, which changes only with its header
// and footer, not with every key typed
const page = computed(() => (pageLayoutState.value?.pages ?? 1) - 1);
const version = computed(
  () =>
    pageLayoutState.value?.bandVersions?.[page.value] ??
    pageLayoutState.value?.versions[page.value] ??
    0,
);
// the footer's slots as one string, read from the engine only where the
// footer shows, and again only when the page or its version changes
const slots = computed(() => {
  const engine = pageEngine;
  void version.value;
  if (!engine || !here.value) return "";
  return engine.bands(page.value).slice(3, 6).join("\u0000");
});
const parts = computed(() => slots.value.split("\u0000"));
const shown = computed(() => parts.value.some(Boolean));

// a double click opens its strip, which takes the focus
const open = () => editor.run(editBand("footer"), { focus: false });
</script>

<template>
  <div
    v-if="place && shown"
    class="page-last-footer"
    aria-hidden="true"
    :title="bandTitle('footer')"
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
