<script setup lang="ts">
import {
  blocksPaneOpen,
  blockToolbar,
  contextMenu,
  imageDialog,
  linkDialog,
  pageSetup,
  tablePicker,
  tableToolbar,
  tocPopover,
  unsavedDialog,
} from "../state";
import BandStrips from "./BandStrips.vue";
import BlockMarks from "./BlockMarks.vue";
import BlocksPane from "./BlocksPane.vue";
import BlockToolbar from "./BlockToolbar.vue";
import BottomBar from "./BottomBar.vue";
import ContextMenu from "./ContextMenu.vue";
import ImageDialog from "./ImageDialog.vue";
import { keyOf } from "./keyOf";
import LinkDialog from "./LinkDialog.vue";
import DocumentOutline from "./DocumentOutline.vue";
import PageSetupDialog from "./PageSetupDialog.vue";
import PageView from "./PageView.vue";
import TablePicker from "./TablePicker.vue";
import TableHandles from "./TableHandles.vue";
import TableToolbar from "./TableToolbar.vue";
import TocPopover from "./TocPopover.vue";
import TopArea from "./TopArea.vue";
import UiTooltip from "./UiTooltip.vue";
import UnsavedDialog from "./UnsavedDialog.vue";

// All of the UI around the editor, see .claude/rules/ui-components.md. Each
// part is keyed by what makes it the same: a dialog by its request, so each
// request gets a dialog of its own.
</script>

<template>
  <!-- before the toolbar, which paints above a strip it overlaps (both 5) -->
  <BandStrips />
  <PageView />
  <BlockMarks />
  <TopArea />
  <BottomBar />
  <DocumentOutline />
  <BlocksPane v-if="blocksPaneOpen" />
  <TableHandles />
  <BlockToolbar v-if="blockToolbar" :state="blockToolbar" />
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
  <UnsavedDialog
    v-if="unsavedDialog"
    :key="keyOf(unsavedDialog)"
    :request="unsavedDialog"
  />
  <TocPopover
    v-if="tocPopover"
    :key="keyOf(tocPopover)"
    :request="tocPopover"
  />
  <ContextMenu
    v-if="contextMenu"
    :key="keyOf(contextMenu.close)"
    :request="contextMenu"
  />
  <UiTooltip />
</template>
