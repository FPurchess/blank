<script setup lang="ts">
import { iconPath, iconStroke } from "../../icons";

// An icon of src/icons.ts, hidden from screen readers: whatever shows it is
// labeled itself. 16px, or 20px where it's `large`.
defineProps<{ name: string; size?: "large" }>();
</script>

<template>
  <svg
    class="icon"
    :class="size"
    viewBox="0 0 24 24"
    aria-hidden="true"
    :stroke-width="iconStroke(name)"
  >
    <path :d="iconPath(name)" />
  </svg>
</template>
