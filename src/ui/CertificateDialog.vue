<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef } from "vue";

import {
  certificateDialog,
  type CertificateDialogRequest,
  closeDialog,
} from "../state";
import BaseDialog from "./components/BaseDialog.vue";
import TextField from "./components/TextField.vue";
import { checkCertificate } from "./certificateDialogModel";

// Makes the user a certificate to sign with, or opens a key file they have
// (Settings ▸ Signing, or the Sign dialog): the passphrase that protects
// their key, and for a new one their name and email. What goes wrong, a
// wrong passphrase above all, is said in the dialog, which stays open.
const props = defineProps<{ request: CertificateDialogRequest }>();

const creating = props.request.mode === "create";
const name = shallowRef(props.request.name);
const email = shallowRef("");
const passphrase = shallowRef("");
const again = shallowRef("");
const submitted = shallowRef(false);
const working = shallowRef(false);
// what the native side said went wrong
const failure = shallowRef("");
const check = computed(() =>
  checkCertificate(creating, {
    name: name.value,
    passphrase: passphrase.value,
    again: again.value,
    submitted: submitted.value,
  }),
);
const error = computed(() => failure.value || check.value.error);

const nameField = useTemplateRef<InstanceType<typeof TextField>>("nameField");
const passphraseField =
  useTemplateRef<InstanceType<typeof TextField>>("passphraseField");
onMounted(() => (nameField.value ?? passphraseField.value)!.select());

const close = (callback: () => void) =>
  closeDialog(certificateDialog, callback);
const typed = () => {
  failure.value = "";
};
const submit = async () => {
  submitted.value = true;
  if (!check.value.valid || working.value) return;
  working.value = true;
  failure.value =
    (await props.request.submit({
      name: name.value.trim(),
      email: email.value.trim(),
      passphrase: passphrase.value,
    })) ?? "";
  working.value = false;
  if (!failure.value) close(() => undefined);
};
</script>

<template>
  <BaseDialog
    id="certificate-dialog"
    :title="creating ? 'Create certificate' : 'Import certificate'"
    form-class="certificate-dialog"
    @submit="submit"
    @cancel="close(request.cancel)"
  >
    <template v-if="creating">
      <TextField
        id="certificate-dialog-name"
        ref="nameField"
        v-model="name"
        label="Name"
        :error-id="
          check.field === 'name' ? 'certificate-dialog-error' : undefined
        "
        @input="typed"
      />
      <TextField
        id="certificate-dialog-email"
        v-model="email"
        type="email"
        label="Email (optional)"
        @input="typed"
      />
    </template>
    <p v-else class="dialog-text">{{ request.file }}</p>
    <TextField
      id="certificate-dialog-passphrase"
      ref="passphraseField"
      v-model="passphrase"
      type="password"
      label="Passphrase"
      :error-id="
        error && check.field !== 'name' ? 'certificate-dialog-error' : undefined
      "
      @input="typed"
    />
    <TextField
      v-if="creating"
      id="certificate-dialog-again"
      v-model="again"
      type="password"
      label="Passphrase again"
      @input="typed"
    />
    <p id="certificate-dialog-error" class="error" aria-live="polite">
      {{ error }}
    </p>
    <p v-if="creating" class="note">
      Blank keeps your key on this computer, protected by the passphrase. Blank
      can't recover a forgotten passphrase, so back up your key.
    </p>
    <template #actions>
      <button type="button" @click="close(request.cancel)">Cancel</button>
      <button type="submit" :disabled="working">
        {{ creating ? "Create" : "Import" }}
      </button>
    </template>
  </BaseDialog>
</template>
