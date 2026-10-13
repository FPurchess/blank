<script setup lang="ts">
import { onMounted, shallowRef, useTemplateRef } from "vue";

import { closeDialog, placeDialog, type PlaceDialogRequest } from "../state";
import BaseDialog from "./components/BaseDialog.vue";
import TextField from "./components/TextField.vue";
import { placeProblem } from "./placeDialogModel";

// Asks where the user signs, for a place stamp on a PDF before Blank knows
// a place (src/pdf/stampActions.ts): what is typed is remembered, and the
// stamp shows it.
const props = defineProps<{ request: PlaceDialogRequest }>();

const place = shallowRef(props.request.place);
const failure = shallowRef("");
const field = useTemplateRef<InstanceType<typeof TextField>>("field");
onMounted(() => field.value?.select());

const close = (callback: () => void) => closeDialog(placeDialog, callback);
const submit = () => {
  failure.value = placeProblem(place.value);
  if (failure.value) return field.value?.select();
  const typed = place.value.trim();
  close(() => props.request.submit(typed));
};
</script>

<template>
  <BaseDialog
    id="place-dialog"
    title="Where do you sign?"
    form-class="place-dialog"
    @submit="submit"
    @cancel="close(props.request.cancel)"
  >
    <TextField
      id="place-dialog-place"
      ref="field"
      v-model="place"
      label="Place"
      placeholder="Where you sign, e.g. Berlin"
      :error-id="failure ? 'place-dialog-error' : undefined"
      @input="failure = ''"
    />
    <p id="place-dialog-error" class="error" aria-live="polite">
      {{ failure }}
    </p>
    <p class="note">Blank remembers it for the next time you sign.</p>
    <template #actions>
      <button type="button" @click="close(props.request.cancel)">Cancel</button>
      <button type="submit">Place</button>
    </template>
  </BaseDialog>
</template>
