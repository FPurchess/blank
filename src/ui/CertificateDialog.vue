<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef } from "vue";

import {
  certificateDialog,
  type CertificateDialogRequest,
  closeDialog,
} from "../state";
import BaseDialog from "./components/BaseDialog.vue";
import TextField from "./components/TextField.vue";
import { busyNote, checkCertificate } from "./certificateDialogModel";

// Makes the user a certificate to sign with, or opens a key file they have
// (Settings ▸ Signing, or the Sign dialog): the passphrase that protects
// their key, and for a new one their name and email. What goes wrong, a
// wrong passphrase above all, is said in the dialog, which stays open.
// Making or opening a key takes a few seconds, which the dialog says; it
// can't be cancelled meanwhile, since the certificate would still come.
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
    email: email.value,
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
const cancel = () => {
  if (!working.value) close(props.request.cancel);
};
// which field what's wrong is about
const errorFor = (field: "name" | "email" | "passphrase" | "again") =>
  error.value && (check.value.field ?? "passphrase") === field
    ? "certificate-dialog-error"
    : undefined;
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
  if (!failure.value) close(props.request.done);
};
</script>

<template>
  <BaseDialog
    id="certificate-dialog"
    :title="creating ? 'Create certificate' : 'Import key file'"
    form-class="certificate-dialog"
    @submit="submit"
    @cancel="cancel"
  >
    <template v-if="creating">
      <TextField
        id="certificate-dialog-name"
        ref="nameField"
        v-model="name"
        label="Name"
        :error-id="errorFor('name')"
        @input="typed"
      />
      <TextField
        id="certificate-dialog-email"
        v-model="email"
        type="email"
        label="Email (optional)"
        :error-id="errorFor('email')"
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
      :error-id="errorFor('passphrase')"
      @input="typed"
    />
    <TextField
      v-if="creating"
      id="certificate-dialog-again"
      v-model="again"
      type="password"
      label="Passphrase again"
      :error-id="errorFor('again')"
      @input="typed"
    />
    <p id="certificate-dialog-error" class="error" aria-live="polite">
      {{ error }}
    </p>
    <p id="certificate-dialog-status" class="note" aria-live="polite">
      {{ working ? busyNote(creating) : "" }}
    </p>
    <p v-if="creating" class="note">
      Blank keeps your key on this computer, protected by the passphrase. Blank
      can't recover a forgotten passphrase, so back up your key.
    </p>
    <template #actions>
      <button type="button" :disabled="working" @click="cancel">Cancel</button>
      <button type="submit" :disabled="working">
        {{
          working
            ? creating
              ? "Creating…"
              : "Importing…"
            : creating
              ? "Create"
              : "Import"
        }}
      </button>
    </template>
  </BaseDialog>
</template>
