<script setup lang="ts" generic="P extends string">
import { nextTick, shallowRef } from "vue";

// A section of the settings with inner pages, e.g. Spelling with your
// dictionary: a page shows in place of the section (the `page` slot), and
// Back gives the focus to the button that opened it. The section stays,
// hidden, so that button is still there. The default slot gets `open`.
const page = shallowRef<P | null>(null);
let opener: HTMLElement | null = null;

const open = (name: P, event: Event) => {
  opener = event.currentTarget as HTMLElement;
  page.value = name;
};
const back = async () => {
  page.value = null;
  await nextTick();
  opener?.focus();
};
</script>

<template>
  <slot v-if="page !== null" name="page" :page="page" :back="back" />
  <div :hidden="page !== null">
    <slot :open="open" />
  </div>
</template>
