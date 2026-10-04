<script setup lang="ts">
import type { CommandIdentifier } from "../../config";
import IconButton from "./IconButton.vue";

// The head of a side pane (see side-pane in src/scss/_controls.scss): its
// title, and the button that hides it.
withDefaults(
  defineProps<{
    title: string;
    titleId: string;
    hideIcon: string;
    hideLabel: string;
    command?: CommandIdentifier;
    focusable?: boolean;
  }>(),
  { command: undefined, focusable: true },
);
const emit = defineEmits<{ hide: [] }>();
</script>

<template>
  <header class="side-pane-head">
    <h2 :id="titleId" class="side-pane-title">{{ title }}</h2>
    <IconButton
      :icon="hideIcon"
      :label="hideLabel"
      :command="command"
      :focusable="focusable"
      @click="emit('hide')"
    />
  </header>
</template>
