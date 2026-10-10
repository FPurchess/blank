<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";

import {
  closeDialog,
  confirmDialog,
  type ConfirmDialogRequest,
} from "../state";
import BaseDialog from "./components/BaseDialog.vue";

// The question before something that can't be undone, e.g. removing the
// user's certificate (src/signing/certificate.ts): do it, or not. Cancel
// has the focus, so Enter never does it by accident; what else the dialog
// offers (backing up first) leaves it open.
const props = defineProps<{ request: ConfirmDialogRequest }>();

const cancelButton = useTemplateRef<HTMLButtonElement>("cancelButton");
onMounted(() => cancelButton.value!.focus());

const close = (callback: () => void) => closeDialog(confirmDialog, callback);
</script>

<template>
  <BaseDialog
    id="confirm-dialog"
    :title="request.title"
    described-by="confirm-dialog-text"
    @submit="close(props.request.confirm)"
    @cancel="close(props.request.cancel)"
  >
    <div id="confirm-dialog-text">
      <p class="dialog-text">{{ request.text }}</p>
      <p v-if="request.fingerprint" class="dialog-text fingerprint">
        {{ request.fingerprint }}
      </p>
    </div>
    <template v-if="request.secondary" #secondary>
      <button type="button" @click="request.secondary.run">
        {{ request.secondary.label }}
      </button>
    </template>
    <template #actions>
      <button ref="cancelButton" type="button" @click="close(request.cancel)">
        Cancel
      </button>
      <button type="submit">{{ request.action }}</button>
    </template>
  </BaseDialog>
</template>
