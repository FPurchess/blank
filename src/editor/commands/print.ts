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
import { basename } from "../../paths";
import { printDocument, printingNow, printPdfFile } from "../../print/job";
import {
  type Destination,
  NOTHING_TO_PRINT,
  PDF_NOT_OPEN,
  PDF_STILL_OPENING,
  PRINT_UNAVAILABLE,
  printPaper,
  STILL_PRINTING,
} from "../../print/printModel";
import {
  activeTab,
  activeTabId,
  announce,
  importedFrom,
  path,
  printDialog,
  shownPdf,
  tabLabel,
} from "../../state";
import { isEmpty, PDF_EXPORT, runExport } from "./exportAs";
import { openPageSetup } from "./pageSetup";
import { showPdfProblem } from "../tabs";

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
  const file = { path: docPath, importedFrom: importedFrom.value };
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
      void runExport(state, file, {
        title: PDF_EXPORT,
        exporter: toPDF,
        filters: [PDF_FILTER],
        context: { pages },
      });
    },
    pageSetup: () => openPageSetup(view),
    cancel: () => view.focus(),
  };
  return true;
};

/**
 * printShownPdf prints the PDF tab shown: its file as it is, straight to the
 * system's print dialog (see printPdfFile)
 */
const printShownPdf = () => {
  const pdf = shownPdf.value;
  const tab = activeTabId.value;
  if (!pdf || !tab) return;
  if (printingNow()) {
    announce(STILL_PRINTING);
    return;
  }
  if (!pdf.opened) {
    const note = pdf.problem ? PDF_NOT_OPEN : PDF_STILL_OPENING;
    sendNotification({ title: "Print", body: note });
    announce(note);
    return;
  }
  void printPdfFile({
    tab,
    path: pdf.path,
    title: basename(pdf.path),
    pages: pdf.opened.pages,
  }).then((problem) => {
    // the tab says why, with Open again or Find it…
    if (problem) showPdfProblem(tab, problem);
  });
};

/**
 * print opens the print dialog of the document shown; in a PDF tab, it
 * prints the PDF
 */
export default (): Command => (_state, dispatch, view) => {
  if (!dispatch || !view) return true;
  if (shownPdf.value) printShownPdf();
  else openPrint(view);
  return true;
};
