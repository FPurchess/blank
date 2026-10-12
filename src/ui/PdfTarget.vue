<script setup lang="ts">
import { computed } from "vue";

import type { Frame } from "../engine/frames";
import { PDF_VIEW_ID } from "../pdf/placeholder";
import { dismissShownPlace, fillPlace } from "../pdf/placeActions";
import { placeElementId, placeLabel, placeName } from "../pdf/placeModel";
import type { Place } from "../pdf/places";
import { lastPlace } from "../state";
import { styleOf } from "./rect";
import { stampBox } from "./stampOverlayModel";
import { tipAttrs } from "./tooltipModel";

// A place to sign or date on a PDF's page (PdfView.vue): a signature field
// of its form, or a place found by its label, as a dashed box in the
// accent. Enter, Space or a click fills it with its stamp; Delete dismisses
// a found place (undoable), never a field. Its tooltip names it; one that
// can't be filled in now says why there instead, and when pressed.
const props = defineProps<{
  place: Place;
  // the page it shows on
  frame: Frame;
  // CSS pixels per point
  scale: number;
  // why it can't be filled in now, null when it can
  refusal: string | null;
}>();

const box = computed(() =>
  stampBox(props.place.rect, props.frame, props.scale),
);
const pages = () => document.getElementById(PDF_VIEW_ID);

const fill = () => {
  const self = document.getElementById(placeElementId(props.place.id));
  void fillPlace(props.place, () => (self ?? pages())?.focus());
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    fill();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    event.stopPropagation();
    dismissShownPlace(props.place);
  }
};
</script>

<template>
  <button
    :id="placeElementId(place.id)"
    type="button"
    class="pdf-target"
    :data-kind="place.kind"
    :aria-label="placeLabel(place)"
    :aria-disabled="refusal ? true : undefined"
    v-bind="tipAttrs({ name: refusal ?? placeName(place) })"
    :style="styleOf(box)"
    @click="fill"
    @keydown="onKeydown"
    @focus="lastPlace = place.id"
    @pointerdown.stop
  />
</template>
