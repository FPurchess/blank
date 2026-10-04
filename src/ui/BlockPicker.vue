<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";

import { blockPicker, type BlockPickerRequest } from "../state";
import { closeDialog } from "./closeDialog";
import BaseDialog from "./components/BaseDialog.vue";

// The block picker (Mod+Alt+B, see src/editor/commands/contentBlocks.ts):
// the content blocks Blank can insert, a table of contents and forms of the
// templates. ↑↓ move between them, Enter or a click inserts one. A template
// that can't be used shows why, and can't be picked.
const props = defineProps<{ request: BlockPickerRequest }>();

const list = useTemplateRef<HTMLElement>("list");
const buttons = () => [
  ...(list.value?.querySelectorAll<HTMLButtonElement>(
    "button.choice:not(:disabled)",
  ) ?? []),
];
onMounted(() => buttons()[0]?.focus());

const close = (callback: () => void) => closeDialog(blockPicker, callback);
const pick = (id: string) => close(() => props.request.pick(id));
// the form submitted: the focused choice, or the first
const submit = () => {
  const focused = buttons().find((button) => button === document.activeElement);
  const id = (focused ?? buttons()[0])?.dataset.block;
  if (id) pick(id);
};

// ↑↓ move between the choices, wrapping around
const move = (event: KeyboardEvent) => {
  const all = buttons();
  const at = all.indexOf(document.activeElement as HTMLButtonElement);
  if (at === -1) return;
  const step = event.key === "ArrowDown" ? 1 : -1;
  event.preventDefault();
  all[(at + step + all.length) % all.length].focus();
};
</script>

<template>
  <BaseDialog
    id="block-picker"
    title="Insert a block"
    form-class="block-picker"
    @submit="submit"
    @cancel="close(request.cancel)"
  >
    <div
      ref="list"
      class="choices"
      role="list"
      @keydown.down="move"
      @keydown.up="move"
    >
      <button
        v-for="choice in request.choices"
        :key="choice.id"
        type="button"
        class="choice"
        role="listitem"
        :data-block="choice.id"
        :disabled="choice.disabled"
        @click="pick(choice.id)"
      >
        <span class="label">{{ choice.label }}</span>
        <span class="description">{{ choice.description }}</span>
      </button>
    </div>
    <template #actions>
      <button type="button" @click="close(request.cancel)">Cancel</button>
    </template>
  </BaseDialog>
</template>
