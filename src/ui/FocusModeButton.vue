<script setup lang="ts">
import { CommandIdentifier } from "../config";
import { focusMode, setFocusMode } from "../state";
import StatusItem from "./StatusItem.vue";

// Focus mode, at the right end of the bottom bar: on, the controls fade while
// the user writes (src/state/focusMode.ts).
</script>

<template>
  <StatusItem
    id="ui-focus-mode"
    icon="focus-mode"
    label="Focus mode"
    :pressed="focusMode"
    :command="CommandIdentifier.VIEW_FOCUS_MODE"
    @click="setFocusMode(!focusMode)"
  />
</template>
