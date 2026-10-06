<script setup lang="ts">
import { onUnmounted } from "vue";

import { bandEditor } from "../state";
import BandEditor from "./BandEditor.vue";
import { keyOf } from "./keyOf";

// The header or footer being edited (BandEditor.vue), keyed by its request,
// so each opening mounts a new one. The pages show the bands at rest and
// offer to add or edit one where it prints (BandTarget.vue on the sheets
// and the marks where pages end, PageFrame.vue, and beside the first and
// last pages, PageEdgeBand.vue); editBand opens it from the keys too.

// with the strips gone, no strip is open, and the editor takes the focus
// again
onUnmounted(() => (bandEditor.value = null));
</script>

<template>
  <BandEditor
    v-if="bandEditor"
    :key="keyOf(bandEditor)"
    :request="bandEditor"
  />
</template>
