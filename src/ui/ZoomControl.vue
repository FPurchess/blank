<script setup lang="ts">
import { computed } from "vue";

import { commandLabel } from "../commandList";
import { CommandIdentifier } from "../config";
import { useEditor } from "../editor/handle";
import { commandFor } from "../editor/plugins/keymap";
import { engineMissing, pageZoom, zoomFactor, zoomLabel } from "../state";
import StatusItem from "./StatusItem.vue";

// The zoom of the pages in the bottom bar: − and +, and the zoom between
// them, e.g. "Fit" or "125%", which a click sets to Fit. − and + give way
// on a narrow window, after the misspelling buttons. Without the layout
// engine there are no pages to zoom, so it isn't there.
const C = CommandIdentifier;
const editor = useEditor();
const label = computed(() => zoomLabel(pageZoom.value, zoomFactor.value));
const run = (id: CommandIdentifier) =>
  editor.run(commandFor(id), { focus: false });
</script>

<template>
  <template v-if="!engineMissing">
    <span class="status-sep" aria-hidden="true" />
    <span class="status-narrow">
      <StatusItem
        id="ui-zoom-out"
        icon="zoom-out"
        :label="commandLabel(C.VIEW_ZOOM_OUT)"
        :command="C.VIEW_ZOOM_OUT"
        @click="run(C.VIEW_ZOOM_OUT)"
      />
    </span>
    <StatusItem
      id="ui-zoom"
      class="zoom-value"
      :label="`Zoom: ${label.spoken}. ${label.tip}`"
      :tip="label.tip"
      :command="C.VIEW_ZOOM_FIT"
      @click="run(C.VIEW_ZOOM_FIT)"
      >{{ label.text }}</StatusItem
    >
    <span class="status-narrow">
      <StatusItem
        id="ui-zoom-in"
        icon="zoom-in"
        :label="commandLabel(C.VIEW_ZOOM_IN)"
        :command="C.VIEW_ZOOM_IN"
        @click="run(C.VIEW_ZOOM_IN)"
      />
    </span>
  </template>
</template>
