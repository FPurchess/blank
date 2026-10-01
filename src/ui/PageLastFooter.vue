<script setup lang="ts">
import { computed } from "vue";

import { editBand } from "../editor/commands/editBand";
import { useEditor } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import type { FrameLayout } from "../engine/frames";
import { pageBandParts } from "../layout/placeholders";
import { pageFields, pageLayout, pageLayoutState } from "../state";
import BandSlots from "./BandSlots.vue";
import { bandTitle, lastFooterPlace } from "./pageViewModel";

// The last page's footer in "page ends", right below its text, where the
// marks between the pages show the footers of the others: the last page
// doesn't end in a mark, since the text goes on there. It isn't there when
// the last page has no footer written, so an empty document shows nothing
// but the caret; a placeholder that comes out empty shows its name. The sheets of "pages" show every footer themselves.
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
// the footer's slots, read from the engine only where the footer shows, and
// again only when the page, its version, the page setup or the
// placeholders' values change
const slots = computed(() => {
  const engine = pageEngine;
  void version.value;
  if (!engine || !here.value) return [];
  return pageBandParts(
    pageLayout.value.layout,
    page.value,
    page.value + 1,
    pageFields.value,
    engine.bands(page.value),
  ).slice(3, 6);
});
const shown = computed(() => slots.value.some((parts) => parts.length));

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
    <BandSlots :slots="slots" />
  </div>
</template>
