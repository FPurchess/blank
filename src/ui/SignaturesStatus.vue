<script setup lang="ts">
import { computed } from "vue";

import { CommandIdentifier } from "../config";
import { useEditor } from "../editor/handle";
import { shownPdf, signaturesPopover } from "../state";
import { signaturesLabel } from "./signaturesModel";
import StatusItem from "./StatusItem.vue";

// What the signatures of the PDF shown say, in the status bar: "Not signed",
// "Signed", "Signed, signer unknown", "Changed after signing", "Signature
// invalid" or, when the check failed, "Signatures not checked"; nothing while
// they are checked. A click lists them
// (SignaturesPopover.vue).
const editor = useEditor();
const label = computed(() =>
  signaturesLabel(shownPdf.value?.signatures ?? null),
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
