<script setup lang="ts">
import { computed, useAttrs, useTemplateRef } from "vue";

import IconGlyph from "./IconGlyph.vue";

// A field to search or find with, its icon in it: the blocks pane's search,
// the main menu's and the find panel's fields. Its class and style go on the
// field, the other attributes (its name, role, keys) on the input; the slot
// shows after it, inside the field, e.g. a key or a count.
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ icon?: string }>(), { icon: "search" });
const value = defineModel<string>({ required: true });
const attrs = useAttrs();
const inputAttrs = computed(() =>
  Object.fromEntries(
    Object.entries(attrs).filter(
      ([name]) => name !== "class" && name !== "style",
    ),
  ),
);

const input = useTemplateRef<HTMLInputElement>("input");
defineExpose({
  // focuses the field: with "all", what's in it selected, to type over it;
  // with "end", the cursor after it, to type on
  focus: (at?: "all" | "end") => {
    const element = input.value;
    if (!element) return;
    element.focus();
    if (at === "all") element.select();
    else if (at === "end")
      element.setSelectionRange(element.value.length, element.value.length);
  },
});
</script>

<template>
  <label class="search-field" :class="attrs.class" :style="attrs.style">
    <IconGlyph :name="icon" />
    <input
      ref="input"
      v-model="value"
      type="text"
      autocomplete="off"
      :spellcheck="false"
      v-bind="inputAttrs"
    />
    <slot />
  </label>
</template>
