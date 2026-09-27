<script setup lang="ts">
import { tableToolbar } from "../state";
import TableToolbar from "./TableToolbar.vue";

// The UI that Vue renders, around the editor. The rest is still built by the
// modules that src/ui.ts boots, see .claude/rules/vue-migration.md.
</script>

<template>
  <TableToolbar v-if="tableToolbar" :state="tableToolbar" />
</template>
