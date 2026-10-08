<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from "vue";

import { logWarning } from "../log";
import { confirmTrust } from "../signing/trusted";
import {
  closeDialog,
  signatureDetails,
  type SignatureDetailsRequest,
} from "../state";
import BaseDialog from "./components/BaseDialog.vue";
import IconGlyph from "./components/IconGlyph.vue";
import { groupFingerprint } from "./settings/signingModel";
import {
  canTrust,
  certificateLine,
  lookOf,
  signatureVerdict,
  signedWhen,
  signerName,
  validity,
} from "./signaturesModel";

// The details of one of a PDF's signatures: what Blank found, when it was
// signed, the signer's certificate and its fingerprint, and, for a
// certificate Blank doesn't trust, Trust this certificate…, which asks to
// compare the fingerprint with the signer's first (see trust.rs).
const props = defineProps<{ request: SignatureDetailsRequest }>();

const signature = computed(() => props.request.signature);
const name = computed(() => signerName(signature.value));
const certificate = computed(() => signature.value.certificate);
const fingerprint = computed(() =>
  certificate.value ? groupFingerprint(certificate.value.fingerprint) : "",
);

const closeButton = useTemplateRef<HTMLButtonElement>("closeButton");
onMounted(() => closeButton.value?.focus());

const close = () => closeDialog(signatureDetails, props.request.refocus);
const trust = () =>
  closeDialog(signatureDetails, () =>
    confirmTrust(signature.value, fingerprint.value, props.request.refocus),
  );
const copy = async () => {
  try {
    await navigator.clipboard.writeText(fingerprint.value);
  } catch (error) {
    logWarning("failed to copy the fingerprint", error);
  }
};
</script>

<template>
  <BaseDialog
    id="signature-details"
    :title="`Signature of ${name}`"
    form-class="signature-details"
    described-by="signature-verdict"
    @submit="close"
    @cancel="close"
  >
    <p
      id="signature-verdict"
      class="signature-verdict"
      :class="lookOf(signature)"
    >
      <IconGlyph :name="lookOf(signature) === 'bad' ? 'seal-off' : 'seal'" />
      {{ signatureVerdict(signature) }}
    </p>
    <dl class="signature-facts">
      <div>
        <dt>Signed</dt>
        <dd>{{ signedWhen(signature) }}</dd>
      </div>
      <template v-if="certificate">
        <div>
          <dt>Certificate</dt>
          <dd>{{ certificateLine(certificate) }}</dd>
        </div>
        <div>
          <dt>Valid</dt>
          <dd>{{ validity(certificate) }}</dd>
        </div>
        <div>
          <dt>Fingerprint</dt>
          <dd>
            <span class="fingerprint">{{ fingerprint }}</span>
            <button type="button" class="copy" @click="copy">Copy</button>
          </dd>
        </div>
      </template>
      <div v-if="signature.reason">
        <dt>Reason</dt>
        <dd>{{ signature.reason }}</dd>
      </div>
      <div v-if="signature.location">
        <dt>Location</dt>
        <dd>{{ signature.location }}</dd>
      </div>
    </dl>
    <p class="note">
      <template v-if="canTrust(signature)"
        >Compare this fingerprint with {{ name }}, by phone or in person, before
        you trust it.
      </template>
      Blank doesn't check certificate authorities or revocation.
    </p>
    <template v-if="canTrust(signature)" #secondary>
      <button type="button" @click="trust">Trust this certificate…</button>
    </template>
    <template #actions>
      <button ref="closeButton" type="submit">Close</button>
    </template>
  </BaseDialog>
</template>
