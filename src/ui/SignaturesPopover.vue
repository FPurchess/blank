<script setup lang="ts">
import { computed, onMounted, onUpdated, useTemplateRef } from "vue";

import { place } from "../popup";
import type { CheckedSignature } from "../signing/ipc";
import {
  closeDialog,
  shownPdf,
  signatureDetails,
  signaturesPopover,
  type SignaturesPopoverRequest,
} from "../state";
import IconGlyph from "./components/IconGlyph.vue";
import { useDismiss } from "./composables/useDismiss";
import {
  lookOf,
  signatureStatus,
  signedWhen,
  signerName,
} from "./signaturesModel";

// The signatures of the PDF shown, above their item in the status bar
// (SignaturesStatus.vue): who signed, when and by whose clock, what the
// signature says, and Details…. Esc, a press elsewhere, or the item again
// closes it.
const props = defineProps<{ request: SignaturesPopoverRequest }>();

const root = useTemplateRef<HTMLElement>("root");
const list = computed(() =>
  Array.isArray(shownPdf.value?.signatures) ? shownPdf.value.signatures : [],
);
const item = () => document.getElementById("ui-signatures");

const placeIt = () => {
  const box = item()?.getBoundingClientRect();
  if (box && root.value) place(root.value, box);
};
onMounted(() => {
  placeIt();
  (root.value?.querySelector("button") ?? root.value)?.focus();
});
onUpdated(placeIt);

const close = () => closeDialog(signaturesPopover, props.request.refocus);
useDismiss(() => [root.value, item()], close, { escape: true, resize: true });

const details = (signature: CheckedSignature) =>
  closeDialog(signaturesPopover, () => {
    signatureDetails.value = {
      signature,
      refocus: props.request.refocus,
    };
  });
</script>

<template>
  <div
    id="signatures-popover"
    ref="root"
    class="signatures-popover"
    role="dialog"
    aria-label="Signatures"
    tabindex="-1"
  >
    <div class="signatures-head">Signatures</div>
    <ul v-if="list.length">
      <li
        v-for="signature in list"
        :key="signature.field"
        class="signature-row"
        :class="lookOf(signature)"
      >
        <IconGlyph :name="lookOf(signature) === 'bad' ? 'seal-off' : 'seal'" />
        <div>
          <div class="who">{{ signerName(signature) }}</div>
          <div class="meta">{{ signedWhen(signature) }}</div>
          <div class="meta status">{{ signatureStatus(signature) }}</div>
        </div>
        <button type="button" @click="details(signature)">Details…</button>
      </li>
    </ul>
    <p v-else class="empty">
      This PDF has no digital signatures. Signing it adds yours.
    </p>
  </div>
</template>
