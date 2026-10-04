<script setup lang="ts">
import { noPrimaryPaste } from "../editor/pagePointer";
import { keepFocus } from "./toolbarModel";
import TopTitle from "./TopTitle.vue";

// The top of the window, on the desk above the pages: the tab row (for now
// the document's title) and the formatting toolbar, each row a component of
// its own. Presses here keep the editor's focus, and a middle click pastes
// nothing.
</script>

<template>
  <header id="ui-top" @mousedown="keepFocus" @mouseup="noPrimaryPaste">
    <div class="top-row tab-row">
      <TopTitle />
    </div>
    <div class="top-row toolbar-row" />
  </header>
</template>
