<script setup lang="ts">
import { computed } from "vue";

import { CommandIdentifier } from "../config";
import { commandFor } from "../editor/plugins/keymap";
import { useEditor } from "../editor/handle";
import { describePaper } from "../layout/describe";
import { localeUnit } from "../layout/paper";
import { announce, pageLayout, shownPdf } from "../state";
import { pdfPaper } from "./pdfViewModel";
import StatusItem from "./StatusItem.vue";

// The paper of the document in the bottom bar, which opens the page setup.
// pageLayout only changes with the frontmatter or the defaults, not while
// typing. A PDF tab shows the paper of the PDF's first page, which Blank
// can't set up.
const editor = useEditor();
const firstPage = computed(() => shownPdf.value?.opened?.pages[0]);
const label = computed(() =>
  shownPdf.value
    ? firstPage.value
      ? pdfPaper(firstPage.value, localeUnit())
      : ""
    : describePaper(pageLayout.value.layout, localeUnit()),
);
const open = () => {
  if (!shownPdf.value)
    return editor.run(commandFor(CommandIdentifier.PAGE_SETUP));
  announce(
    `The PDF's paper: ${label.value}. Its pages can't be set up in Blank.`,
  );
};
</script>

<template>
  <StatusItem
    v-if="label"
    id="ui-page"
    icon="page"
    :command="CommandIdentifier.PAGE_SETUP"
    @click="open"
    >{{ label }}</StatusItem
  >
</template>
