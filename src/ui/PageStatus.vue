<script setup lang="ts">
import { computed } from "vue";

import { pageLayout, pagePosition } from "../state";
import { pageLabel } from "./pageViewModel";

// "Page N of M" in the bottom bar: the page of the caret, numbered as the
// pages are, and how many there are. A component of its own, since it
// changes as the caret moves. Screen readers are told when it changes, as
// they read the text, not the painted pages.
const label = computed(() =>
  pagePosition.value
    ? pageLabel(pagePosition.value, pageLayout.value.layout)
    : "",
);
</script>

<template>
  <span v-if="label" id="ui-page-number" role="status">{{ label }}</span>
</template>
