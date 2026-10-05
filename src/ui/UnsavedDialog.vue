<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";

import {
  closeDialog,
  unsavedDialog,
  type UnsavedDialogRequest,
} from "../state";
import BaseDialog from "./components/BaseDialog.vue";

// The question before a tab with unsaved changes closes (see closeTab in
// src/editor/tabs.ts): save them, drop them, or keep the tab open.
const props = defineProps<{ request: UnsavedDialogRequest }>();

const save = useTemplateRef<HTMLButtonElement>("save");
onMounted(() => save.value!.focus());

const close = (callback: () => void) => closeDialog(unsavedDialog, callback);
</script>

<template>
  <BaseDialog
    id="unsaved-dialog"
    :title="`Save changes to “${request.label}”?`"
    described-by="unsaved-dialog-text"
    @submit="close(props.request.save)"
    @cancel="close(props.request.cancel)"
  >
    <p id="unsaved-dialog-text" class="dialog-text">
      Your changes will be lost if you don't save them.
    </p>
    <template #secondary>
      <button type="button" @click="close(request.discard)">Don't save</button>
    </template>
    <template #actions>
      <button type="button" @click="close(request.cancel)">Cancel</button>
      <button ref="save" type="submit">Save</button>
    </template>
  </BaseDialog>
</template>
