<script setup lang="ts">
import { computed } from "vue";

import { CommandIdentifier, getKeyBinding } from "../config";
import { pageSetup } from "../editor/commands";
import { formatShortcut } from "../editor/keyBindings";
import { useEditor } from "../editor/handle";
import { describePageSize } from "../layout/describe";
import { localeUnit } from "../layout/paper";
import { pageLayout } from "../state";

// The paper of the document in the bottom bar, which opens the page setup.
// pageLayout only changes with the frontmatter or the defaults, not while
// typing.
const editor = useEditor();
const label = computed(() =>
  describePageSize(pageLayout.value.layout, localeUnit()),
);
const title = computed(
  () =>
    `Page setup (${formatShortcut(getKeyBinding(CommandIdentifier.PAGE_SETUP))})`,
);
const open = () => editor.run(pageSetup());
</script>

<template>
  <!-- mousedown keeps the focus in the editor, which gets it back from the
  dialog -->
  <span
    id="ui-page"
    role="button"
    :title="title"
    @mousedown.prevent
    @click="open"
    >{{ label }}</span
  >
</template>
