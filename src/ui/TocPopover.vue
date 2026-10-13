<script setup lang="ts">
import { shallowRef } from "vue";

import { closeDialog, tocPopover, type TocPopoverRequest } from "../state";
import BlockPopover from "./components/BlockPopover.vue";
import { DEPTH_OPTIONS, titleOf } from "./tocPopoverModel";

// The settings of a table of contents (Enter, Shift+Enter or the toolbar's
// settings button, see src/editor/commands/contentBlocks.ts): how deep it
// lists the headings, and its title.
const props = defineProps<{ request: TocPopoverRequest }>();

const depth = shallowRef(props.request.values.depth);
const title = shallowRef(props.request.values.title);

const apply = () =>
  props.request.apply({ depth: depth.value, title: titleOf(title.value) });
const close = () => closeDialog(tocPopover, props.request.close);
</script>

<template>
  <BlockPopover
    id="toc-popover"
    title="Table of contents"
    :anchor="request.anchor"
    @close="close"
  >
    <label for="toc-popover-depth">Headings it lists</label>
    <select id="toc-popover-depth" v-model.number="depth" @change="apply">
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
  </BlockPopover>
</template>
