<script setup lang="ts">
import { computed } from "vue";

import { pagePosition } from "../state";
import { pageLabel } from "./pageViewModel";

// "Page N of M" in the bottom bar: the page of the caret among the pages,
// and how many there are. A component of its own, since it changes as the
// caret moves. Screen readers, which read the text, not the painted pages,
// are told when the caret moves to another page, not when typing changes
// how many there are: the live region stays in place, so a change is read
// out, and says only the page.
const label = computed(() =>
  pagePosition.value ? pageLabel(pagePosition.value) : "",
);
const spoken = computed(() =>
  pagePosition.value ? `Page ${pagePosition.value.page}` : "",
);
</script>

<template>
  <span v-if="label" id="ui-page-number">{{ label }}</span>
  <span id="ui-page-spoken" class="visually-hidden" role="status">{{
    spoken
  }}</span>
</template>
