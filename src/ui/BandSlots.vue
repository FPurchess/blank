<script setup lang="ts">
import { type BandPart, FIELD_NAMES } from "../layout/placeholders";

// The left, center and right slots of a header or footer beside the pages,
// with a placeholder that comes out empty named in its place, quietly, as
// the strips show their chips (see src/layout/placeholders.ts)
defineProps<{ slots: BandPart[][] }>();
</script>

<template>
  <span v-for="(parts, index) in slots" :key="index"
    ><template v-for="(part, at) in parts" :key="at"
      ><template v-if="'text' in part">{{ part.text }}</template
      ><em v-else class="band-placeholder" :data-field="part.field">{{
        FIELD_NAMES[part.field]
      }}</em></template
    ></span
  >
</template>
