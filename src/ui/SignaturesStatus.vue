<script setup lang="ts">
import { computed, watch } from "vue";

import { CommandIdentifier } from "../config";
import { useEditor } from "../editor/handle";
import { announce, shownPdf, signaturesPopover } from "../state";
import { signaturesLabel } from "./signaturesModel";
import StatusItem from "./StatusItem.vue";

// What the signatures of the PDF shown say, in the status bar: "Not signed",
// "Signed", "Signed, signer unknown", "Changed after signing", "Signature
// invalid" or, when the check failed, "Signatures not checked" (with why, if
// the file changed or went); nothing while
// they are checked. A click lists them
// (SignaturesPopover.vue). A result with a doubt or worse is read out once
// it's in, since it changes how far to rely on the PDF.
const editor = useEditor();
const label = computed(() =>
  signaturesLabel(shownPdf.value?.signatures ?? null),
);
watch(
  () => label.value?.text,
  () => {
    if (label.value && label.value.look !== "ok")
      announce(label.value.text, { quiet: true });
  },
);
const open = () => {
  signaturesPopover.value = signaturesPopover.value
    ? null
    : { refocus: () => editor.focus() };
};
</script>

<template>
  <StatusItem
    v-if="label"
    id="ui-signatures"
    :class="`sig-${label.look}`"
    :icon="label.icon || undefined"
    :command="CommandIdentifier.VIEW_SIGNATURES"
    aria-haspopup="dialog"
    :aria-expanded="!!signaturesPopover"
    @click="open"
    >{{ label.text }}</StatusItem
  >
</template>
