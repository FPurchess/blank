<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";

import type { MenuEntry } from "./menuModel";

// An item of the context menu turned into a text field, e.g. to edit a word
// of the personal dictionary: Enter submits, Esc goes back to the item, Tab
// closes the menu. Its keys stay in it, away from the menu's.
const props = defineProps<{ item: MenuEntry }>();
const emit = defineEmits<{
  submit: [value: string];
  cancel: [];
  close: [];
}>();

const input = useTemplateRef<HTMLInputElement>("input");

onMounted(() => {
  // set once, not bound, so a new render keeps what was typed
  input.value!.value = props.item.edit!.value;
  input.value!.focus();
  input.value!.select();
});
</script>

<template>
  <input
    ref="input"
    type="text"
    spellcheck="false"
    autocomplete="off"
    :aria-label="item.label"
    @keydown.stop
    @keydown.enter.prevent="emit('submit', input!.value)"
    @keydown.esc.prevent="emit('cancel')"
    @keydown.tab.prevent="emit('close')"
    @click.stop
  />
</template>
