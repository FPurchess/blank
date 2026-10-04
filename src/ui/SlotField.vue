<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from "vue";

import type { DocumentFields } from "../layout/bands";
import type { Slots } from "../layout/settings";
import {
  createSlotEditor,
  type SlotEditor,
  type SlotKeys,
} from "../slotEditor";

// One slot of the open header or footer strip, which holds a small
// ProseMirror editor (src/slotEditor.ts). Vue renders only the slot's
// element: the editor's DOM inside it is ProseMirror's, and so is its
// `data-empty`.
const props = defineProps<{
  // left, center or right
  position: keyof Slots;
  // what the slot holds when it's shown; typing doesn't come back here
  text: string;
  fields: DocumentFields;
  // what Tab, Shift+Tab, Enter and Escape do
  keys: SlotKeys;
}>();
const emit = defineEmits<{ ready: [editor: SlotEditor]; focus: [] }>();

const place = useTemplateRef<HTMLElement>("place");
let editor: SlotEditor | undefined;
onMounted(() => {
  editor = createSlotEditor(place.value!, props.text, props.fields, props.keys);
  editor.view.dom.addEventListener("focus", () => emit("focus"));
  emit("ready", editor);
});
onUnmounted(() => editor?.destroy());
</script>

<template>
  <div
    ref="place"
    class="slot"
    :class="position"
    :data-placeholder="position[0].toUpperCase() + position.slice(1)"
  />
</template>
