<script setup lang="ts">
import { computed } from "vue";

import type { DocumentFields } from "../layout/bands";
import { printedParts } from "../slotEditor";

// The text of a header or footer slot as the edges show it at rest: the
// placeholders as their values, and those that differ from page to page as
// chips, like the slot editor's (src/slotEditor.ts).
const props = defineProps<{ text: string; fields: DocumentFields }>();
const parts = computed(() => printedParts(props.text, props.fields));
</script>

<template>
  <template v-for="(part, index) in parts" :key="index"
    ><span
      v-if="'field' in part"
      class="chip"
      :data-field="part.field"
      :title="part.title"
      >{{ part.text }}</span
    ><template v-else>{{ part.text }}</template></template
  >
</template>
