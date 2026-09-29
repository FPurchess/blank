<script setup lang="ts">
import { pagePosition } from "../state";

// "Page N of M" in the bottom bar: the page of the caret, and how many
// there are. A component of its own, since it changes as the caret moves.
</script>

<template>
  <span v-if="pagePosition" id="ui-page-number">
    Page {{ pagePosition.page }} of {{ pagePosition.pages }}
  </span>
</template>
