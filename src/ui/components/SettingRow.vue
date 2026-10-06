<script setup lang="ts">
// A row of a dialog's settings: its label on the left, with an optional
// description below it, and its control on the right (the slot). Attributes
// go on the row, e.g. the role of an OptionGroup.
defineProps<{
  // the label's id, which names the control for screen readers
  id: string;
  // the row, as `data-row`, which the dialog's ↑↓ and tests find it by
  name: string;
  label: string;
  // a sentence about the setting below its label
  description?: string;
}>();
</script>

<template>
  <div class="setting" :data-row="name">
    <span class="setting-text">
      <span :id="id" class="setting-label">{{ label }}</span>
      <small v-if="description" :id="`${id}-description`">{{
        description
      }}</small>
    </span>
    <slot />
  </div>
</template>
