<script setup lang="ts">
import { onMounted, shallowRef } from "vue";

import { tocDialog, type TocDialogRequest } from "../state";
import { closeDialog } from "./closeDialog";
import BaseDialog from "./components/BaseDialog.vue";
import OptionGroup from "./components/OptionGroup.vue";
import TextField from "./components/TextField.vue";
import { DEPTH_OPTIONS } from "./tocDialogModel";

// The dialog of a table of contents (Enter on a selected one, see
// src/editor/commands/contentBlocks.ts): how deep it lists the headings, and
// its title. It can also remove it.
const props = defineProps<{ request: TocDialogRequest }>();

const depth = shallowRef(props.request.depth);
const title = shallowRef(props.request.title);

onMounted(() =>
  document
    .querySelector<HTMLButtonElement>(
      '#toc-dialog [data-row="depth"] button[tabindex="0"]',
    )
    ?.focus(),
);

const close = (callback: () => void) => closeDialog(tocDialog, callback);
const submit = () =>
  close(() => props.request.submit(depth.value, title.value.trim()));
</script>

<template>
  <BaseDialog
    id="toc-dialog"
    title="Table of contents"
    @submit="submit"
    @cancel="close(request.cancel)"
  >
    <OptionGroup
      id="toc-dialog-depth"
      v-model="depth"
      name="depth"
      label="Headings it lists"
      :options="DEPTH_OPTIONS"
    />
    <TextField id="toc-dialog-text" v-model="title" label="Title" />
    <template #actions>
      <button type="submit">Save</button>
      <button type="button" @click="close(request.remove)">Remove</button>
      <button type="button" @click="close(request.cancel)">Cancel</button>
    </template>
  </BaseDialog>
</template>
