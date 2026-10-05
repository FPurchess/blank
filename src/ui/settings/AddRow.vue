<script setup lang="ts">
import { enterInField } from "./settingsModel";

// The fields that add an entry to a list of the settings and Add, e.g. a word
// to your dictionary: Enter in a field adds too, and what is wrong shows
// below, described by the fields (the slot gets its id as `errorId`).
defineProps<{
  id: string;
  // what is wrong with what was typed, "" for nothing
  error: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ add: [] }>();
</script>

<template>
  <div class="add-row" @keydown.enter="enterInField($event) && emit('add')">
    <slot :error-id="error ? `${id}-error` : undefined" />
    <button type="button" class="add" :disabled="disabled" @click="emit('add')">
      Add
    </button>
  </div>
  <p v-if="error" :id="`${id}-error`" class="error" role="alert">
    {{ error }}
  </p>
</template>
