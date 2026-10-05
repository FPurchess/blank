<script setup lang="ts">
import SettingRow from "../components/SettingRow.vue";

// A setting edited on an inner page, e.g. your dictionary: its row, with
// what it holds as the description, and Edit…, which the row names.
defineProps<{
  id: string;
  name: string;
  label: string;
  description: string;
}>();
const emit = defineEmits<{ open: [event: MouseEvent] }>();
</script>

<template>
  <SettingRow :id="id" :name="name" :label="label" :description="description">
    <button
      type="button"
      class="edit"
      :aria-describedby="`${id} ${id}-description`"
      @click="emit('open', $event)"
    >
      Edit…
    </button>
  </SettingRow>
</template>
