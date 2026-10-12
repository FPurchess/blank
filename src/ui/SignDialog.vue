<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import { config } from "../config";
import {
  closeDialog,
  signDialog,
  type SignDialogRequest,
  signingCertificate,
} from "../state";
import BaseDialog from "./components/BaseDialog.vue";
import OptionGroup from "./components/OptionGroup.vue";
import TextField from "./components/TextField.vue";
import { HOW_OPTIONS, type How, timeNote } from "./signDialogModel";

// Signs a document (see src/editor/commands/signing.ts): which of its
// signature blocks is the user's and where they sign, whether their
// certificate signs it too (with its passphrase), then where the signed PDF
// goes. The signature, the name and the date come from the user's signature
// and settings.
const props = defineProps<{ request: SignDialogRequest }>();

const chosen = shallowRef(props.request.chosen);
const place = shallowRef(props.request.place);
const how = shallowRef<How>(signingCertificate.value ? "digital" : "visible");
const passphrase = shallowRef("");
const failure = shallowRef("");
const checking = shallowRef(false);
const digital = computed(
  () => !!signingCertificate.value && how.value === "digital",
);
const note = computed(() => timeNote(config.value.signing.timestampServer));

const placeField = useTemplateRef<InstanceType<typeof TextField>>("placeField");
const passphraseField =
  useTemplateRef<InstanceType<typeof TextField>>("passphraseField");
onMounted(() => placeField.value!.select());

// a certificate made from here signs at once: on to its passphrase
watch(signingCertificate, (now, before) => {
  if (!now || before) return;
  how.value = "digital";
  void nextTick(() => passphraseField.value?.select());
});

const close = (callback: () => void) => closeDialog(signDialog, callback);
// the passphrase being checked can't be cancelled, the PDF would still come
const cancel = () => {
  if (!checking.value) close(props.request.cancel);
};
const submit = async () => {
  if (checking.value) return;
  if (digital.value) {
    if (!passphrase.value) {
      failure.value = "Enter the passphrase of your key.";
      return;
    }
    // the passphrase is checked before anything is exported
    checking.value = true;
    failure.value = (await props.request.check(passphrase.value)) ?? "";
    checking.value = false;
    // closed meanwhile, e.g. for another tab: nothing is signed
    if (signDialog.value !== props.request) return;
    if (failure.value) return;
  }
  const secret = digital.value ? passphrase.value : null;
  close(() => props.request.submit(chosen.value, place.value.trim(), secret));
};
</script>

<template>
  <BaseDialog
    id="sign-dialog"
    :title="`Sign “${request.title}”`"
    form-class="sign-dialog"
    @submit="submit"
    @cancel="cancel"
  >
    <OptionGroup
      v-if="request.targets.length > 1"
      id="sign-dialog-target"
      v-model="chosen"
      name="target"
      label="Block"
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
    <OptionGroup
      v-if="signingCertificate"
      id="sign-dialog-how"
      v-model="how"
      name="how"
      label="Signature"
      :options="HOW_OPTIONS"
    />
    <TextField
      v-if="digital"
      id="sign-dialog-passphrase"
      ref="passphraseField"
      v-model="passphrase"
      type="password"
      label="Passphrase"
      :error-id="failure ? 'sign-dialog-error' : undefined"
      @input="failure = ''"
    />
    <p id="sign-dialog-error" class="error" aria-live="polite">
      {{ failure }}
    </p>
    <p id="sign-dialog-status" class="note" aria-live="polite">
      {{ checking ? "Checking your passphrase." : "" }}
    </p>
    <p v-for="warning in request.warnings" :key="warning" class="warning">
      {{ warning }}
    </p>
    <p v-if="digital" class="note">{{ note }}</p>
    <p v-else-if="!signingCertificate" class="note">
      The PDF shows your signature as a picture. To sign it digitally too, so
      anyone can check it, create a certificate.
    </p>
    <p v-else class="note">The PDF shows your signature as a picture.</p>
    <template v-if="!signingCertificate" #secondary>
      <button
        type="button"
        @click="request.createCertificate($event.currentTarget)"
      >
        Create certificate…
      </button>
    </template>
    <template #actions>
      <button type="button" :disabled="checking" @click="cancel">Cancel</button>
      <button type="submit" :disabled="checking">
        {{ checking ? "Checking…" : "Sign…" }}
      </button>
    </template>
  </BaseDialog>
</template>
