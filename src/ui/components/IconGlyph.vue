<script setup lang="ts">
import { iconPath } from "../../icons";

// An icon of src/icons.ts, hidden from screen readers: whatever shows it is
// labelled itself.
defineProps<{ name: string }>();
</script>

<template>
  <svg class="icon" viewBox="0 0 20 20" aria-hidden="true">
    <path :d="iconPath(name)" />
  </svg>
</template>
