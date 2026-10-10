import type { EditorState } from "prosemirror-state";

import { readFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { printPDF } from "../engine/pdf";
import { errorMessage } from "../errors";
import { logError, logWarning } from "../log";
import type { Layout } from "../layout/resolve";
import { announce } from "../state";
import {
  isPrintError,
  preparePrint,
  type Preset,
  printPdfTab,
  sendPrint,
} from "./ipc";
import {
  failedNote,
  instead,
  insteadForPdf,
  MAY_NOT_HAVE_PRINTED,
  PDF_CHANGED,
  PDF_MISSING,
  PDF_NOT_OPEN,
  PDF_PRINTS_WHOLE,
  PDF_PRINTS_WHOLE_FIRST,
  type PrintPlan,
  sentMessage,
  systemNote,
} from "./printModel";
import { applySystemChoices, printSheets, type Size } from "./sheets";

// Printing: the print PDF Blank's engine writes, with the pages, pages per
// sheet and scale applied, handed to the system's print dialog, which knows
// the printers (see .claude/rules/print.md).

// what E2E captures instead of printing, since the system's dialog can't be
// automated: a debug build prints into it once a test sets it
export interface PrintCapture {
  sent: { sheets: number; pdf: string }[];
}

declare global {
  interface Window {
    blankPrintCapture?: PrintCapture;
  }
}

export interface PrintJob {
  state: EditorState;
  docPath: string | null;
  layout: Layout;
  // the document's name, for the system's dialog and the printer's queue
  title: string;
  // the size of its pages, in points
  page: Size;
  plan: PrintPlan;
  // opens the print dialog again with a reason, after printing didn't work
  reopen(note: string): void;
}

// whether a print is on its way to the system, which a second one waits for
let printing = false;
export const printingNow = () => printing;

/**
 * printDocument prints the pages of a plan: it asks the system what to print
 * on (Linux), writes the print PDF, and hands it to the system's print
 * dialog. Cancelling says nothing; what didn't work opens the print dialog
 * again with the reason, ready to save a PDF instead.
 */
export const printDocument = async ({
  state,
  docPath,
  layout,
  title,
  page,
  plan,
  reopen,
}: PrintJob) => {
  const sheetsOf = (paper?: Size) =>
    printSheets({
      pages: plan.pages,
      page,
      perSheet: plan.perSheet,
      scale: plan.scale,
      paper,
    });
  const [first] = sheetsOf();
  const preset: Preset = {
    copies: plan.copies,
    collate: plan.collate,
    fit: plan.scale === "fit",
    paper: { width: first.width, height: first.height },
  };
  const capture = __TEST_HOOKS__ ? window.blankPrintCapture : undefined;
  let note: string | undefined;
  printing = true;
  try {
    const setup = capture ? null : await preparePrint(title, preset);
    if (setup?.outcome === "cancelled") return;
    const sheets = applySystemChoices(sheetsOf(setup?.paper ?? undefined), {
      ranges: setup?.ranges ?? undefined,
      scale: setup?.scale ?? undefined,
    });
    // the system's pages left none of them
    if (!sheets.length) return;
    const { contents, warnings } = await printPDF(state, {
      docPath,
      layout,
      sheets,
    });
    if (capture) {
      const pdf = new TextDecoder().decode(contents.subarray(0, 5));
      capture.sent = [...capture.sent, { sheets: sheets.length, pdf }];
      return;
    }
    const sent = await sendPrint(contents, {
      token: setup?.token ?? null,
      title,
      preset,
    });
    if (sent.outcome === "cancelled") return;
    // the pages the system chose, which may be fewer than Blank's
    const pages = sheets.reduce(
      (count, sheet) => count + sheet.placements.length,
      0,
    );
    if (sent.outcome === "sent") announce(sentMessage(pages, sent.printer));
    if (warnings.length)
      sendNotification({ title: "Print", body: warnings.join(". ") });
  } catch (error) {
    note = failureNote(error);
  } finally {
    printing = false;
  }
  // once the print is over, or the dialog would wait for it
  if (note) reopen(note);
};

/**
 * failureNote logs why printing failed and returns what the print dialog
 * says when it opens again, ready to save a PDF instead; none when the job
 * may have printed all the same, which a notification says
 */
const failureNote = (
  error: unknown,
  then: (reason: string) => string = instead,
): string | undefined => {
  if (!isPrintError(error)) {
    logError("printing failed", error);
    return failedNote(errorMessage(error), then);
  }
  switch (error.kind) {
    case "noService":
      logError("there is no print service", error.message);
      return systemNote("noService", then);
    case "unsupported":
      logError("WebView2 can't show its print dialog", error.message);
      return systemNote("unsupported", then);
    // the job may have gone out, so printing again could print it twice
    case "uncertain":
      logWarning("printing may have failed", error.message);
      sendNotification({ title: "Print", body: MAY_NOT_HAVE_PRINTED });
      return undefined;
    default:
      logError("printing failed", error.message);
      return failedNote(error.message, then);
  }
};

export interface PdfPrintJob {
  // the PDF tab, whose native side holds its file and its SHA-256
  tab: string;
  path: string;
  title: string;
  // its pages' sizes, in points: the system's dialog starts on the first's
  pages: readonly Size[];
}

// the system's dialog on Linux leaves the pages and the scale to Blank
const asksFirst = () => /Linux/.test(navigator.platform);

/**
 * printPdfFile prints a PDF tab's file as it is, unchanged, while it is the
 * PDF the tab shows: Blank's print dialog chooses what Blank's engine lays
 * out, which a PDF Blank didn't write isn't, so the file goes straight to
 * the system's print dialog. Cancelling says nothing; what didn't work a
 * notification says.
 * @returns "missing" or "changed" when the file was moved or deleted, or
 * changed, since the tab opened it, which its tab then shows
 */
export const printPdfFile = async ({
  tab,
  path,
  title,
  pages,
}: PdfPrintJob): Promise<"missing" | "changed" | undefined> => {
  const preset: Preset = {
    copies: 1,
    collate: true,
    fit: false,
    paper: pages[0] ?? { width: 595, height: 842 },
  };
  const capture = __TEST_HOOKS__ ? window.blankPrintCapture : undefined;
  let note: string | undefined;
  let problem: "missing" | "changed" | undefined;
  printing = true;
  try {
    if (capture) {
      const contents = await readFile(path);
      const pdf = new TextDecoder().decode(contents.subarray(0, 5));
      capture.sent = [...capture.sent, { sheets: pages.length, pdf }];
      return;
    }
    if (asksFirst()) {
      sendNotification({ title: "Print", body: PDF_PRINTS_WHOLE_FIRST });
      announce(PDF_PRINTS_WHOLE_FIRST);
    }
    const printed = await printPdfTab(tab, { title, preset });
    if (printed.outcome === "whole") note = PDF_PRINTS_WHOLE;
    else if (printed.outcome === "sent")
      announce(sentMessage(pages.length, printed.printer));
  } catch (error) {
    if (isPrintError(error) && error.kind === "changed") {
      logWarning("printing a PDF failed: it changed since it was opened");
      note = PDF_CHANGED;
      problem = "changed";
    } else if (isPrintError(error) && error.kind === "missing") {
      logWarning("printing a PDF failed: it was moved or deleted");
      note = PDF_MISSING;
      problem = "missing";
    } else if (isPrintError(error) && error.kind === "notOpen") {
      logWarning("printing a PDF failed: it isn't open");
      note = PDF_NOT_OPEN;
    } else note = failureNote(error, insteadForPdf);
  } finally {
    printing = false;
  }
  if (note) {
    sendNotification({ title: "Print", body: note });
    announce(note);
  }
  return problem;
};
