<script setup lang="ts">
import { computed } from "vue";

import { importedFrom, path } from "../state";
import { titleOf } from "./statusBarModel";

// The bar at the top of the window: which document this is. A path is shown
// as text, never parsed as HTML.
const title = computed(() => `» ${titleOf(path.value, importedFrom.value)}`);
</script>

<template>
  <div id="ui-top">{{ title }}</div>
</template>
