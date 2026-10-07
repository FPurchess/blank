<script setup lang="ts">
import { useTemplateRef } from "vue";

import IconGlyph from "./IconGlyph.vue";

// A field to search or find with, its icon in it: the blocks pane's search,
// the main menu's and the find panel's fields. The attributes (its name,
// role, keys) go on the input; the slot shows after it, inside the field,
// e.g. a key or a count.
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ icon?: string }>(), { icon: "search" });
const value = defineModel<string>({ required: true });

const input = useTemplateRef<HTMLInputElement>("input");
defineExpose({
  // focuses the field, and with `all` selects what's in it, to type over it
  focus: (all = false) => {
    input.value?.focus();
    if (all) input.value?.select();
  },
  input: () => input.value,
});
</script>

<template>
  <label class="search-field">
    <IconGlyph :name="icon" />
    <input
      ref="input"
      v-model="value"
      type="text"
      autocomplete="off"
      :spellcheck="false"
      v-bind="$attrs"
    />
    <slot />
  </label>
</template>
