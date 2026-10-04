<script setup lang="ts">
import { onMounted, onUpdated, shallowRef, useTemplateRef } from "vue";

import { place } from "../popup";
import { tocPopover, type TocPopoverRequest } from "../state";
import { closeDialog } from "./closeDialog";
import { useDismiss } from "./composables/useDismiss";
import {
  anchorOf,
  DEPTH_OPTIONS,
  SETTINGS_BUTTON,
  titleOf,
} from "./tocPopoverModel";

// The settings of a table of contents, below the toolbar's settings button
// (Enter or a click on it, see src/editor/commands/contentBlocks.ts): how
// deep it lists the headings, and its title. Each change applies at once,
// as one undo step; Esc, Enter in the title or a click elsewhere closes
// them, and the focus goes back to the table of contents.
const props = defineProps<{ request: TocPopoverRequest }>();

const root = useTemplateRef<HTMLElement>("root");
const depthField = useTemplateRef<HTMLSelectElement>("depth");
const depth = shallowRef(props.request.depth);
const title = shallowRef(props.request.title);

const placeIt = () =>
  place(root.value!, anchorOf(props.request.anchor), { align: "end" });
onMounted(() => {
  placeIt();
  depthField.value!.focus();
});
onUpdated(placeIt);

const apply = () => props.request.apply(depth.value, titleOf(title.value));
const close = () => closeDialog(tocPopover, props.request.close);

// Enter in the title closes them
const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
    event.preventDefault();
    close();
  }
};

// a press elsewhere, Esc, leaving the window or resizing it closes them; a
// press on the settings button is theirs, which closes them through it
useDismiss(() => [root.value, document.querySelector(SETTINGS_BUTTON)], close, {
  escape: true,
  blur: true,
  resize: true,
});
</script>

<template>
  <div
    id="toc-popover"
    ref="root"
    class="toc-popover"
    role="dialog"
    aria-labelledby="toc-popover-title"
    @keydown="onKeyDown"
  >
    <h2 id="toc-popover-title">Table of contents</h2>
    <label for="toc-popover-depth">Headings it lists</label>
    <select
      id="toc-popover-depth"
      ref="depth"
      v-model.number="depth"
      @change="apply"
    >
      <option
        v-for="option in DEPTH_OPTIONS"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
    <label for="toc-popover-title-field">Title</label>
    <input
      id="toc-popover-title-field"
      v-model="title"
      type="text"
      autocomplete="off"
      :spellcheck="false"
      @input="apply"
    />
  </div>
</template>
