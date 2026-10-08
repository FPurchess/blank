<script setup lang="ts">
import { onMounted, shallowRef, useTemplateRef } from "vue";

import { closeDialog, signDialog, type SignDialogRequest } from "../state";
import BaseDialog from "./components/BaseDialog.vue";
import OptionGroup from "./components/OptionGroup.vue";
import TextField from "./components/TextField.vue";

// Signs a document (see src/editor/commands/signing.ts): which of its
// signature blocks is the user's and where they sign, then where the signed
// PDF goes. The signature, the name and the date come from the user's
// signature and settings.
const props = defineProps<{ request: SignDialogRequest }>();

const chosen = shallowRef(props.request.chosen);
const place = shallowRef(props.request.place);
const placeField = useTemplateRef<InstanceType<typeof TextField>>("placeField");
onMounted(() => placeField.value!.select());

const close = (callback: () => void) => closeDialog(signDialog, callback);
const submit = () =>
  close(() => props.request.submit(chosen.value, place.value.trim()));
</script>

<template>
  <BaseDialog
    id="sign-dialog"
    :title="`Sign “${request.title}”`"
    form-class="sign-dialog"
    @submit="submit"
    @cancel="close(request.cancel)"
  >
    <OptionGroup
      v-if="request.targets.length > 1"
      id="sign-dialog-target"
      v-model="chosen"
      name="target"
      label="Sign in"
      :options="
        request.targets.map((target) => ({
          value: target.pos,
          label: target.label,
        }))
      "
    />
    <TextField
      id="sign-dialog-place"
      ref="placeField"
      v-model="place"
      label="Place"
      placeholder="Where you sign"
    />
    <p v-for="warning in request.warnings" :key="warning" class="warning">
      {{ warning }}
    </p>
    <p class="note">
      Your signature, your name and today’s date go into the signature block.
      The PDF shows the signature as a picture.
    </p>
    <template #actions>
      <button type="button" @click="close(request.cancel)">Cancel</button>
      <button type="submit">Sign…</button>
    </template>
  </BaseDialog>
</template>
