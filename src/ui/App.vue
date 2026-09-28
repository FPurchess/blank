<script setup lang="ts">
import {
  contextMenu,
  imageDialog,
  linkDialog,
  pageSetup,
  tablePicker,
  tableToolbar,
} from "../state";
import ContextMenu from "./ContextMenu.vue";
import ImageDialog from "./ImageDialog.vue";
import { keyOf } from "./keyOf";
import LinkDialog from "./LinkDialog.vue";
import PageSetupDialog from "./PageSetupDialog.vue";
import TablePicker from "./TablePicker.vue";
import TableToolbar from "./TableToolbar.vue";

// The UI that Vue renders, around the editor. The rest is still built by the
// modules that src/ui.ts boots, see .claude/rules/vue-migration.md. A dialog
// is keyed by its request, so each request gets a dialog of its own.
</script>

<template>
  <TableToolbar v-if="tableToolbar" :state="tableToolbar" />
  <TablePicker v-if="tablePicker" :state="tablePicker" />
  <LinkDialog
    v-if="linkDialog"
    :key="keyOf(linkDialog)"
    :request="linkDialog"
  />
  <ImageDialog
    v-if="imageDialog"
    :key="keyOf(imageDialog)"
    :request="imageDialog"
  />
  <PageSetupDialog
    v-if="pageSetup"
    :key="keyOf(pageSetup)"
    :request="pageSetup"
  />
  <ContextMenu
    v-if="contextMenu"
    :key="keyOf(contextMenu.close)"
    :request="contextMenu"
  />
</template>
