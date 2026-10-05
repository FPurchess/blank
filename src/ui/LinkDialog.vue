<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef } from "vue";

import { closeDialog, linkDialog, type LinkDialogRequest } from "../state";
import BaseDialog from "./components/BaseDialog.vue";
import TextField from "./components/TextField.vue";
import { checkLink } from "./linkDialogModel";

// The dialog for a link (Mod+K, see src/editor/commands/editLink.ts): its URL,
// checked as it's typed, and its text. For a link that's already there, it can
// also turn it back into plain text.
const props = defineProps<{ request: LinkDialogRequest }>();

const url = shallowRef(props.request.url);
const text = shallowRef(props.request.text);
// an empty URL only says so once the user tries to save it
const submitted = shallowRef(false);
const check = computed(() => checkLink(url.value, submitted.value));

const urlField = useTemplateRef<InstanceType<typeof TextField>>("urlField");
onMounted(() => urlField.value!.select());

const close = (callback: () => void) => closeDialog(linkDialog, callback);
const submit = () => {
  submitted.value = true;
  if (check.value.valid) {
    close(() => props.request.submit(url.value, text.value));
  }
};
</script>

<template>
  <BaseDialog
    id="link-dialog"
    :title="request.isEdit ? 'Edit link' : 'Link'"
    @submit="submit"
    @cancel="close(request.cancel)"
  >
    <TextField
      id="link-dialog-url"
      ref="urlField"
      v-model="url"
      label="URL"
      :hint="{ id: 'link-dialog-hint', text: check.hint }"
      @input="submitted = false"
    />
    <TextField id="link-dialog-text" v-model="text" label="Link Text" />
    <template v-if="request.isEdit" #secondary>
      <button type="button" @click="close(request.convertToText)">
        Convert to Text
      </button>
    </template>
    <template #actions>
      <button type="button" @click="close(request.cancel)">Cancel</button>
      <button type="submit" :disabled="check.blocked">Save</button>
    </template>
  </BaseDialog>
</template>
