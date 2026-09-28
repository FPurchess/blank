<script setup lang="ts">
import { computed } from "vue";

import { spellcheck, spellcheckMessage, spellcheckStatus } from "../state";
import { spellcheckLabel } from "./statusBarModel";

// Whether spell check is on and its dictionary ready, or a message for a
// moment (e.g. "No spelling errors"). A click turns spell check on or off.
const label = computed(() =>
  spellcheckLabel(
    spellcheckStatus.value,
    spellcheckMessage.value?.text ?? null,
  ),
);
</script>

<template>
  <span
    id="ui-spellcheck"
    :title="label.title"
    :hidden="!label.text"
    :data-state="spellcheckStatus.state"
    @mousedown.prevent
    @click="spellcheck = !spellcheck"
    >{{ label.text }}</span
  >
</template>
