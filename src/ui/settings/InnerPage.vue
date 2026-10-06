<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";

import IconButton from "../components/IconButton.vue";

// A page of the settings in place of its section, e.g. your dictionary: a
// head with Back and its name, its content, and a note below. Esc goes back
// instead of closing the dialog. It starts with the focus in its first field.
defineProps<{
  title: string;
  // what the page is of, after its name, e.g. the language
  subtitle?: string;
  // the back button's tooltip, e.g. "Back to Spelling"
  backTip: string;
}>();
const emit = defineEmits<{ back: [] }>();

const root = useTemplateRef<HTMLElement>("root");
onMounted(() => {
  const first =
    root.value!.querySelector<HTMLElement>("input") ??
    root.value!.querySelector<HTMLElement>("button");
  first?.focus();
});
</script>

<template>
  <div ref="root" class="inner-page" @keydown.esc.stop.prevent="emit('back')">
    <div class="inner-head">
      <IconButton
        icon="chevron-left"
        label="Back"
        :tip="backTip"
        @click="emit('back')"
      />
      <h3>{{ title }}</h3>
      <span v-if="subtitle" class="subtitle">{{ subtitle }}</span>
    </div>
    <slot />
    <p v-if="$slots.footnote" class="footnote"><slot name="footnote" /></p>
  </div>
</template>
