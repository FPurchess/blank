<script setup lang="ts">
import { computed } from "vue";

import { CommandIdentifier } from "../config";
import { spellcheck, spellcheckMessage, spellcheckStatus } from "../state";
import { spellcheckLabel } from "./statusBarModel";
import StatusItem from "./StatusItem.vue";

// Whether spell check is on and its dictionary ready, or a message for a
// moment (e.g. "No spelling errors"). It's there while spell check is off
// too, and a click turns it on or off.
const label = computed(() =>
  spellcheckLabel(
    spellcheckStatus.value,
    spellcheckMessage.value?.text ?? null,
  ),
);
</script>

<template>
  <StatusItem
    id="ui-spellcheck"
    icon="spell"
    :tip="label.tip"
    :command="CommandIdentifier.SPELLCHECK_TOGGLE"
    :pressed="spellcheck"
    :data-state="spellcheckStatus.state"
    @click="spellcheck = !spellcheck"
    >{{ label.text }}</StatusItem
  >
</template>
