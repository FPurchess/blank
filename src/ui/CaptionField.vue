<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";

import type { TableToolbarState } from "../state";

// The field for the table's caption, which table mode and the toolbar's
// caption button open: Enter sets the caption, Esc leaves it as it was.
const props = defineProps<{
  caption: NonNullable<TableToolbarState["caption"]>;
}>();

const input = useTemplateRef<HTMLInputElement>("input");

const submit = () => props.caption.submit(input.value!.value);

onMounted(() => {
  // set once, not bound: the toolbar updates while scrolling, and a bound
  // value would undo what was typed
  input.value!.value = props.caption.value;
  input.value!.focus();
  input.value!.select();
});
</script>

<template>
  <form class="caption" @submit.prevent="submit">
    <input
      ref="input"
      placeholder="Caption"
      aria-label="Caption of the table"
      @keydown.esc.prevent="caption.cancel()"
    />
  </form>
</template>
