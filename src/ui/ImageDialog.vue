<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
} from "vue";

import { imageDialog, type ImageDialogRequest } from "../state";
import { closeDialog } from "./closeDialog";
import BaseDialog from "./components/BaseDialog.vue";
import TextField from "./components/TextField.vue";
import {
  checkImage,
  describeFile,
  sourcePlaceholder,
} from "./imageDialogModel";

// The dialog for an image (see src/editor/commands/editImage.ts): a path or
// web address, or a file chosen with the native dialog, which is embedded in
// the document, and a description. An image that's already there can also be
// removed.
const props = defineProps<{ request: ImageDialogRequest }>();

// an embedded image isn't shown as its data: URL, which is long and
// unreadable, but as a note; typing a path or address replaces it
const embedded = shallowRef(
  props.request.src.startsWith("data:") ? props.request.src : null,
);
const source = shallowRef(embedded.value ? "" : props.request.src);
const alt = shallowRef(props.request.alt);
// an empty source only says so once the user tries to insert it
const submitted = shallowRef(false);
const choosing = shallowRef(false);
const check = computed(() =>
  checkImage(source.value, embedded.value, submitted.value, choosing.value),
);

const sourceField =
  useTemplateRef<InstanceType<typeof TextField>>("sourceField");
const altField = useTemplateRef<InstanceType<typeof TextField>>("altField");
const chooseButton = useTemplateRef<HTMLButtonElement>("chooseButton");
onMounted(() => sourceField.value!.select());
// the dialog may close while the native file dialog is open
let closed = false;
onUnmounted(() => (closed = true));

const typed = () => {
  embedded.value = null;
  submitted.value = false;
};

const chooseFile = async () => {
  choosing.value = true;
  let image: Awaited<ReturnType<ImageDialogRequest["chooseFile"]>>;
  try {
    image = await props.request.chooseFile();
  } catch (error) {
    // chooseFile returns null for a file it can't read; anything else that
    // fails counts as no choice, so the dialog doesn't stay choosing
    console.error(error);
    image = null;
  }
  choosing.value = false;
  if (closed) return;
  // as after typing: an empty field asks for a source only on the next try
  submitted.value = false;
  if (image) {
    embedded.value = image.src;
    source.value = image.name;
    if (alt.value.trim() === "") alt.value = describeFile(image.name);
    // select the description once it shows the new value
    await nextTick();
    if (!closed) altField.value!.select();
  } else {
    await nextTick();
    if (!closed) chooseButton.value!.focus();
  }
};

const close = (callback: () => void) => closeDialog(imageDialog, callback);
const submit = () => {
  submitted.value = true;
  if (check.value.valid) {
    const src = embedded.value ?? source.value;
    close(() => props.request.submit(src, alt.value));
  }
};
</script>

<template>
  <BaseDialog
    id="image-dialog"
    :title="request.isEdit ? 'Edit image' : 'Image'"
    @submit="submit"
    @cancel="close(request.cancel)"
  >
    <TextField
      id="image-dialog-src"
      ref="sourceField"
      v-model="source"
      label="File or web address"
      :placeholder="sourcePlaceholder(embedded)"
      :hint="{ id: 'image-dialog-hint', text: check.hint }"
      @input="typed"
    >
      <button
        ref="chooseButton"
        type="button"
        class="choose"
        :disabled="choosing"
        @click="chooseFile"
      >
        Choose file…
      </button>
    </TextField>
    <TextField
      id="image-dialog-alt"
      ref="altField"
      v-model="alt"
      label="Description"
    />
    <template #actions>
      <button type="submit" :disabled="check.blocked">
        {{ request.isEdit ? "Save" : "Insert" }}
      </button>
      <button
        v-if="request.isEdit"
        type="button"
        @click="close(request.remove)"
      >
        Remove
      </button>
      <button type="button" @click="close(request.cancel)">Cancel</button>
    </template>
  </BaseDialog>
</template>
