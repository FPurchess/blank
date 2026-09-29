<script setup lang="ts">
import { computed } from "vue";

import { pageSetup } from "../editor/commands";
import { useEditor } from "../editor/handle";
import { PROPERTIES_CLASS, summarize } from "../editor/plugins/properties";
import type { FrameLayout } from "../engine/frames";
import { frontmatter } from "../state";
import { propertiesPlace } from "./pageViewModel";

// The quiet line above the first page of a document that has frontmatter,
// as the editor showed it above the text: e.g. "The Lighthouse · by Ada ·
// tags". Clicking it opens the page setup. It isn't part of the pages, nor
// of the PDF.
const props = defineProps<{ layout: FrameLayout }>();
const editor = useEditor();

const summary = computed(() => summarize(frontmatter.value));
const place = computed(() => propertiesPlace(props.layout));
const open = () => editor.run(pageSetup());
</script>

<template>
  <!-- mousedown keeps the focus in the editor, which gets it back from the
  dialog -->
  <div
    v-if="summary && place"
    :class="PROPERTIES_CLASS"
    role="note"
    title="Properties from the top of the file, kept when you save. Click for the page setup"
    :style="{
      left: `${place.left}px`,
      top: `${place.top}px`,
      width: `${place.width}px`,
    }"
    @mousedown.prevent.stop
    @click="open"
  >
    {{ summary }}
  </div>
</template>
