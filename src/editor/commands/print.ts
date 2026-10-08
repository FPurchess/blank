import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../../config";
import { engineless, pageEngine } from "../../engine/engine";
import { caretPage } from "../../engine/geometry";
import toPDF from "../../engine/pdf";
import { PDF_FILTER } from "../../formats";
import { documentFields } from "../../layout/bands";
import { localeUnit, systemLocale } from "../../layout/paper";
import { pageGeometry, resolveLayout } from "../../layout/resolve";
import { frontmatterOf } from "../../markdown";
import { printDocument, printingNow } from "../../print/job";
import {
  type Destination,
  NOTHING_TO_PRINT,
  PRINT_UNAVAILABLE,
  printPaper,
  STILL_PRINTING,
} from "../../print/printModel";
import {
  activeTab,
  activeTabId,
  announce,
  path,
  printDialog,
  tabLabel,
} from "../../state";
import { exportFile, isEmpty, PDF_EXPORT } from "./exportAs";
import { openPageSetup } from "./pageSetup";

/**
 * openPrint opens the print dialog for the document of `view`
 * @param again why printing didn't work, when it opens again after that,
 *   ready to save a PDF instead
 * @returns whether it opened
 */
export const openPrint = (
  view: EditorView,
  again?: { note: string; destination: Destination },
): boolean => {
  if (printDialog.value !== null) return false;
  if (printingNow()) {
    announce(STILL_PRINTING);
    return false;
  }
  const { state } = view;
  if (engineless() || !pageEngine) {
    sendNotification({ title: "Print", body: PRINT_UNAVAILABLE });
    announce(PRINT_UNAVAILABLE);
    return false;
  }
  if (isEmpty(state)) {
    sendNotification({ title: "Print", body: NOTHING_TO_PRINT });
    announce(NOTHING_TO_PRINT);
    return false;
  }
  // all pages, even those of a long document still being laid out
  const engine = pageEngine;
  engine.finish();
  const locale = systemLocale();
  const { layout } = resolveLayout(
    frontmatterOf(state.doc),
    config.value.layout.page,
    locale,
  );
  const { width, height } = pageGeometry(layout);
  const page = { width, height };
  // the document's file and tab now, before another tab may show
  const docPath = path.value;
  const tab = activeTabId.value;
  const named = activeTab.value;
  const title =
    documentFields(state.doc, docPath).title ||
    (named ? tabLabel(named) : "Untitled");
  // the print dialog again, while its document shows and it can open;
  // else the reason alone
  const reopen = (note: string) => {
    const shown =
      activeTabId.value === tab &&
      openPrint(view, { note, destination: "pdf" });
    if (!shown) sendNotification({ title: "Print", body: note });
  };

  printDialog.value = {
    pages: engine.pages(),
    current: caretPage(state.selection.head) ?? 0,
    page,
    paper: printPaper(layout, localeUnit(locale)),
    ...again,
    print: (plan) => {
      view.focus();
      void printDocument({
        state,
        docPath,
        layout,
        title,
        page,
        plan,
        reopen,
      });
    },
    savePdf: (pages) => {
      view.focus();
      exportFile({
        title: PDF_EXPORT,
        exporter: toPDF,
        filters: [PDF_FILTER],
        state,
        docPath,
        pages,
      });
    },
    pageSetup: () => openPageSetup(view),
    cancel: () => view.focus(),
  };
  return true;
};

export default (): Command => (_state, dispatch, view) => {
  if (dispatch && view) openPrint(view);
  return true;
};
