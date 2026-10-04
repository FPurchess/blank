<script setup lang="ts">
import { computed, onUnmounted, shallowRef } from "vue";

import { NO_FIELDS } from "../layout/bands";
import { listenOnWindow } from "../scope";
import { bandEditor, engineMissing, pageFields, pageLayout } from "../state";
import BandEdge from "./BandEdge.vue";
import BandEditor from "./BandEditor.vue";
import { BANDS, BAR_CONTROLS, nearEdge, shownAtRest } from "./bandStripsModel";
import { useBodyClass } from "./composables/useBodyClass";
import { keyOf } from "./keyOf";

// The header and footer strips: pinned to the top and bottom of the window
// and lined up with the text, since they repeat on every page. At rest a
// faint line shows what they say, or a hint appears near the edge where there
// is none (BandEdge.vue). A click or their shortcut opens the strip for
// editing (BandEditor.vue).
//
// The pages show the bands themselves, on the sheets (PageFrame.vue,
// PageEdgeBand.vue), and open their strips on a double click; the edges then
// only offer to add one, near the bars. Without the layout engine, from the
// start or once it failed, there are no pages, and the edges show the bands.

// what the edges show, which only changes with the page setup, and what its
// placeholders show, which pageFields keeps the same while typing; asked for
// only while there is a band to show them in
const atRest = computed(() => ({
  header: shownAtRest(pageLayout.value.settings, "header"),
  footer: shownAtRest(pageLayout.value.settings, "footer"),
}));
const fields = computed(() =>
  atRest.value.header || atRest.value.footer ? pageFields.value : NO_FIELDS,
);
// an edge hides while its strip is open, and where the pages show its band
const hidden = computed(() =>
  Object.fromEntries(
    BANDS.map((band) => [
      band,
      bandEditor.value?.band === band ||
        (atRest.value[band] !== undefined && !engineMissing.value),
    ]),
  ),
);

for (const band of BANDS) {
  useBodyClass(`has-${band}`, () => atRest.value[band] !== undefined);
}

// the hints show while the mouse is on the bar at the top or bottom, where
// they sit, without an area of their own that would take clicks meant for
// the text; leaving the window, e.g. through an edge, leaves no hint behind
const near = shallowRef<"top" | "bottom" | null>(null);
useBodyClass("near-top", () => near.value === "top");
useBodyClass("near-bottom", () => near.value === "bottom");
listenOnWindow("mousemove", (event) => {
  near.value = nearEdge(
    event.clientY,
    window.innerHeight,
    event.target instanceof Element && !!event.target.closest(BAR_CONTROLS),
  );
});
listenOnWindow("mouseout", (event) => {
  if (event.relatedTarget === null) near.value = null;
});

// with the strips gone, no strip is open, and the editor takes the focus
// again
onUnmounted(() => (bandEditor.value = null));
</script>

<template>
  <BandEdge
    v-for="band in BANDS"
    :key="band"
    :band="band"
    :slots="atRest[band]"
    :fields="fields"
    :hidden="hidden[band]"
  />
  <BandEditor
    v-if="bandEditor"
    :key="keyOf(bandEditor)"
    :request="bandEditor"
  />
</template>
