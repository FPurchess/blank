<script setup lang="ts">
import { contextMenu, tableToolbar, tablePicker } from "../state";
import ContextMenu from "./ContextMenu.vue";
import { menuKey } from "./menuModel";
import TablePicker from "./TablePicker.vue";
import TableToolbar from "./TableToolbar.vue";

// The UI that Vue renders, around the editor. The rest is still built by the
// modules that src/ui.ts boots, see .claude/rules/vue-migration.md.
</script>

<template>
  <TableToolbar v-if="tableToolbar" :state="tableToolbar" />
  <TablePicker v-if="tablePicker" :state="tablePicker" />
  <ContextMenu
    v-if="contextMenu"
    :key="menuKey(contextMenu.close)"
    :request="contextMenu"
  />
</template>
