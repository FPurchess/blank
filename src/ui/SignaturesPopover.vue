<script setup lang="ts">
import { computed, onMounted, onUpdated, useTemplateRef } from "vue";

import { reopenPdf } from "../editor/tabs";
import { basename } from "../paths";
import { place } from "../popup";
import type { CheckedSignature } from "../signing/ipc";
import {
  activeTabId,
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
const checked = computed(() => shownPdf.value?.signatures ?? null);
const list = computed(() =>
  Array.isArray(checked.value) ? checked.value : [],
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

const name = computed(() => basename(shownPdf.value?.path ?? ""));
// the file changed since the tab opened it: Open again checks it as it is
const again = () => {
  const tab = activeTabId.value;
  closeDialog(signaturesPopover, props.request.refocus);
  if (tab) void reopenPdf(tab);
};

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
    :aria-describedby="list.length ? undefined : 'signatures-empty'"
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
        <button
          type="button"
          :aria-label="`Details of ${signerName(signature)}'s signature`"
          @click="details(signature)"
        >
          Details…
        </button>
      </li>
    </ul>
    <template v-else-if="checked === 'changed'">
      <p id="signatures-empty" class="empty">
        {{ name }} changed after Blank opened it. Open it again to check its
        signatures.
      </p>
      <button type="button" class="again" @click="again">Open again</button>
    </template>
    <p v-else-if="checked === 'missing'" id="signatures-empty" class="empty">
      {{ name }} was moved or deleted after Blank opened it, so Blank can't
      check its signatures.
    </p>
    <p v-else-if="checked === 'failed'" id="signatures-empty" class="empty">
      Blank couldn't check this PDF's signatures.
    </p>
    <p v-else-if="checked === null" id="signatures-empty" class="empty">
      Checking the signatures…
    </p>
    <p v-else id="signatures-empty" class="empty">
      This PDF has no digital signatures.
    </p>
  </div>
</template>
