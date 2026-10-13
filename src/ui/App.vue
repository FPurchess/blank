<script setup lang="ts">
import {
  blocksPaneOpen,
  blockToolbar,
  contextMenu,
  findPanel,
  controlsFaded,
  focusMode,
  imageDialog,
  linkDialog,
  pageSetup,
  printDialog,
  settingsDialog,
  tablePicker,
  tableToolbar,
  signatureDialog,
  signDialog,
  placeDialog,
  certificateDialog,
  confirmDialog,
  signaturePopover,
  signatureDetails,
  signaturesPopover,
  shownPdf,
  tocPopover,
  diagramPopover,
  unsavedDialog,
} from "../state";
import BandStrips from "./BandStrips.vue";
import BlockMarks from "./BlockMarks.vue";
import BlocksPane from "./BlocksPane.vue";
import BlockToolbar from "./BlockToolbar.vue";
import BottomBar from "./BottomBar.vue";
import ContextMenu from "./ContextMenu.vue";
import ImageDialog from "./ImageDialog.vue";
import SignatureDialog from "./SignatureDialog.vue";
import SignDialog from "./SignDialog.vue";
import PlaceDialog from "./PlaceDialog.vue";
import CertificateDialog from "./CertificateDialog.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import { keyOf } from "./keyOf";
import LinkDialog from "./LinkDialog.vue";
import DocumentOutline from "./DocumentOutline.vue";
import PageSetupDialog from "./PageSetupDialog.vue";
import PageView from "./PageView.vue";
import PdfView from "./PdfView.vue";
import PrintDialog from "./PrintDialog.vue";
import SettingsDialog from "./settings/SettingsDialog.vue";
import TablePicker from "./TablePicker.vue";
import TableHandles from "./TableHandles.vue";
import TableToolbar from "./TableToolbar.vue";
import TocPopover from "./TocPopover.vue";
import DiagramPopover from "./DiagramPopover.vue";
import FindPanel from "./FindPanel.vue";
import SignaturePopover from "./SignaturePopover.vue";
import SignaturesPopover from "./SignaturesPopover.vue";
import SignatureDetailsDialog from "./SignatureDetailsDialog.vue";
import TopArea from "./TopArea.vue";
import UiTooltip from "./UiTooltip.vue";
import UnsavedDialog from "./UnsavedDialog.vue";
import { useBodyClass } from "./composables/useBodyClass";
import { useWindowCommands } from "./composables/useWindowCommands";
import { watchFocusMode } from "./focusModeModel";

// All of the UI around the editor, see .claude/rules/ui-components.md. Each
// part is keyed by what makes it the same: a dialog by its request, so each
// request gets a dialog of its own.

// the window's commands work wherever the focus is, not only in the editor
useWindowCommands();
// focus mode: the classes that fade the controls, and when they fade
useBodyClass("focus-mode", () => focusMode.value);
useBodyClass("controls-faded", () => controlsFaded.value);
watchFocusMode();
</script>

<template>
  <BandStrips />
  <PageView v-if="!shownPdf" />
  <PdfView v-if="shownPdf" />
  <BlockMarks />
  <TopArea />
  <BottomBar />
  <DocumentOutline />
  <BlocksPane v-if="blocksPaneOpen && !shownPdf" />
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
  <PrintDialog
    v-if="printDialog"
    :key="keyOf(printDialog)"
    :request="printDialog"
  />
  <UnsavedDialog
    v-if="unsavedDialog"
    :key="keyOf(unsavedDialog)"
    :request="unsavedDialog"
  />
  <SettingsDialog
    v-if="settingsDialog"
    :key="keyOf(settingsDialog)"
    :request="settingsDialog"
  />
  <!-- not keyed: it stays while the tabs change -->
  <FindPanel v-if="findPanel" />
  <SignatureDialog
    v-if="signatureDialog"
    :key="keyOf(signatureDialog)"
    :request="signatureDialog"
  />
  <SignDialog
    v-if="signDialog"
    :key="keyOf(signDialog)"
    :request="signDialog"
  />
  <PlaceDialog
    v-if="placeDialog"
    :key="keyOf(placeDialog)"
    :request="placeDialog"
  />
  <CertificateDialog
    v-if="certificateDialog"
    :key="keyOf(certificateDialog)"
    :request="certificateDialog"
  />
  <ConfirmDialog
    v-if="confirmDialog"
    :key="keyOf(confirmDialog)"
    :request="confirmDialog"
  />
  <TocPopover
    v-if="tocPopover"
    :key="keyOf(tocPopover)"
    :request="tocPopover"
  />
  <DiagramPopover
    v-if="diagramPopover"
    :key="keyOf(diagramPopover)"
    :request="diagramPopover"
  />
  <SignaturePopover
    v-if="signaturePopover"
    :key="keyOf(signaturePopover)"
    :request="signaturePopover"
  />
  <SignaturesPopover
    v-if="signaturesPopover"
    :key="keyOf(signaturesPopover)"
    :request="signaturesPopover"
  />
  <SignatureDetailsDialog
    v-if="signatureDetails"
    :key="keyOf(signatureDetails)"
    :request="signatureDetails"
  />
  <ContextMenu
    v-if="contextMenu"
    :key="keyOf(contextMenu.close)"
    :request="contextMenu"
  />
  <UiTooltip />
</template>
