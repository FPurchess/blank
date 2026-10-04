<script setup lang="ts">
import { noPrimaryPaste } from "../editor/pagePointer";
import FormatToolbar from "./FormatToolbar.vue";
import { keepFocus } from "./toolbarModel";
import TabRow from "./TabRow.vue";

// The top of the window, on the desk above the pages: the tab row and the
// formatting toolbar, each row a component of its own. Presses here keep the
// editor's focus, and a middle click pastes nothing.
</script>

<template>
  <header id="ui-top" @mousedown="keepFocus" @mouseup="noPrimaryPaste">
    <TabRow />
    <div class="top-row toolbar-row">
      <FormatToolbar />
    </div>
  </header>
</template>
