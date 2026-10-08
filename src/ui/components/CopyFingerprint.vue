<script setup lang="ts">
import { computed, onUnmounted, shallowRef, useTemplateRef } from "vue";

import { logWarning } from "../../log";
import { groupFingerprint } from "../certificateModel";

// A certificate's fingerprint in groups of four, and Copy, which copies it as
// shown and says "Copied" for a moment, or until it's left. When the
// clipboard refuses, the fingerprint is selected, to copy by hand. Settings ▸
// Signing (CertificateRows.vue) and a signature's details
// (SignatureDetailsDialog.vue) show one.
const props = defineProps<{
  fingerprint: string;
  // the button's class, as the surface draws its buttons
  buttonClass: string;
}>();

const grouped = computed(() => groupFingerprint(props.fingerprint));
const code = useTemplateRef<HTMLElement>("code");

const copied = shallowRef(false);
let timer: ReturnType<typeof setTimeout> | undefined;
const uncopied = () => {
  clearTimeout(timer);
  copied.value = false;
};
onUnmounted(uncopied);

const copy = async () => {
  try {
    await navigator.clipboard.writeText(grouped.value);
  } catch (error) {
    logWarning("failed to copy the fingerprint", error);
    if (code.value) window.getSelection()?.selectAllChildren(code.value);
    return;
  }
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(uncopied, 2000);
};
</script>

<template>
  <code ref="code" class="fingerprint">{{ grouped }}</code>
  <button type="button" :class="buttonClass" @click="copy" @blur="uncopied">
    {{ copied ? "Copied" : "Copy" }}
  </button>
</template>
