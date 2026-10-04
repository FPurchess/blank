<script setup lang="ts">
import { computed } from "vue";

import { CommandIdentifier } from "../config";
import { pageSetup } from "../editor/commands";
import { useEditor } from "../editor/handle";
import { describePageSize } from "../layout/describe";
import { localeUnit } from "../layout/paper";
import { pageLayout } from "../state";
import StatusItem from "./StatusItem.vue";

// The paper of the document in the bottom bar, which opens the page setup.
// pageLayout only changes with the frontmatter or the defaults, not while
// typing.
const editor = useEditor();
const label = computed(() =>
  describePageSize(pageLayout.value.layout, localeUnit()),
);
const open = () => editor.run(pageSetup());
</script>

<template>
  <StatusItem
    id="ui-page"
    icon="page"
    :command="CommandIdentifier.PAGE_SETUP"
    @click="open"
    >{{ label }}</StatusItem
  >
</template>
