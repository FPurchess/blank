<script setup lang="ts">
import { computed } from "vue";

import { CommandIdentifier } from "../config";
import { togglePageView } from "../editor/commands";
import { useEditor } from "../editor/handle";
import { engineMissing, pageView } from "../state";
import { viewLabel } from "./statusBarModel";
import StatusItem from "./StatusItem.vue";

// The view at the right end of the bottom bar: its icon shows the view the
// window is in, the pages or the page ends, and a click switches to the
// other. Without the layout engine there is only the editor's own view, so
// it isn't there.
const editor = useEditor();
const label = computed(() => viewLabel(pageView.value));
</script>

<template>
  <template v-if="!engineMissing">
    <span class="status-sep" aria-hidden="true" />
    <StatusItem
      id="ui-view"
      :icon="pageView === 'pages' ? 'pages' : 'page-ends'"
      :tip="label.tip"
      :label="label.aria"
      :command="CommandIdentifier.VIEW_PAGES"
      @click="editor.run(togglePageView())"
    />
  </template>
</template>
