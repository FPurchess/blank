<script setup lang="ts">
import IconGlyph from "./components/IconGlyph.vue";

// A button that shows or hides more of a dialog, `controls` by its id, e.g.
// "More settings". Its label is the default slot.
defineProps<{ controls: string }>();
const open = defineModel<boolean>({ required: true });
</script>

<template>
  <button
    type="button"
    class="disclosure"
    :aria-expanded="open"
    :aria-controls="controls"
    @click="open = !open"
  >
    <IconGlyph :name="open ? 'chevron-down' : 'chevron-right'" />
    <slot />
  </button>
</template>
