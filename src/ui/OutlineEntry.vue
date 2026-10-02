<script setup lang="ts">
import type { OutlineItem } from "../state";

// A heading in the outline's list, indented by its level (main.scss). The
// item stays the same object while its heading does, so typing elsewhere
// re-renders none of them, and scrolling only the two whose `current`
// changes.
defineProps<{ entry: OutlineItem; current: boolean }>();
const emit = defineEmits<{ jump: [index: number] }>();
</script>

<template>
  <div
    class="outline-entry"
    :class="[`level-${entry.level}`, { current }]"
    role="button"
    tabindex="-1"
    :aria-current="current ? 'location' : undefined"
    @click="emit('jump', entry.index)"
  >
    {{ entry.text }}
  </div>
</template>
