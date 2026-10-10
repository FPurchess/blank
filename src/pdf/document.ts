import { exists } from "@tauri-apps/plugin-fs";

import { logWarning } from "../log";
import { basename } from "../paths";
import { type CheckedSignature, signingKind } from "../signing/ipc";
import {
  failureOf,
  openPdf,
  type OpenedPdf,
  type PdfFailure,
  verifyPdf,
} from "./ipc";

// A PDF tab's document: the PDF it shows, or why it can't. The tabs keep it
// as they keep a markdown tab's state (src/editor/tabs.ts), and the shown
// tab's is `shownPdf` (src/state/pdf.ts), which the page view of PDFs
// (PdfView.vue) updates. Replaced whole on every change.

// why a PDF tab shows no pages
export type PdfProblem =
  // the file isn't where it was
  | "missing"
  // the file can't be read, or changed while it was read
  | "unreadable"
  // the file holds another PDF than the one the tab opened
  | "changed"
  // not a PDF the helper can read
  | "damaged"
  // more than the helper may take: too large, or too slow to open
  | "tooComplex"
  | "needsPassword"
  // the helper couldn't be started
  | "start"
  // the helper stopped while it opened it
  | "stopped"
  // the helper failed twice on it
  | "failed";

export interface PdfTabDocument {
  readonly path: string;
  // what opening it found; null while it has a problem
  readonly opened: OpenedPdf | null;
  readonly problem: PdfProblem | null;
  // the pages the helper couldn't draw (from 0), not asked for again
  readonly failedPages: readonly number[];
  // its signatures as Blank checked them: null until they are, why if they
  // couldn't be
  readonly signatures: readonly CheckedSignature[] | SignaturesUnchecked | null;
}

/**
 * problemOf returns the problem of a PDF the helper couldn't open
 */
export const problemOf = (failure: PdfFailure): PdfProblem => {
  switch (failure) {
    case "needsPassword":
    case "start":
    case "unreadable":
    case "missing":
    case "changed":
    case "failed":
    case "tooComplex":
      return failure;
    case "source":
      return "unreadable";
    case "timedOut":
    case "hung":
      return "tooComplex";
    case "crashed":
      return "stopped";
    default:
      return "damaged";
  }
};

/**
 * withRenderFailure returns `doc` after the helper couldn't draw `page`:
 * the page shows that it couldn't, unless the PDF can't be shown at all
 * any more (its helper failed twice, its file went or changed and a new
 * helper couldn't open it again), whose problem then shows instead of the
 * pages; a tab closed meanwhile keeps it as it is
 */
export const withRenderFailure = (
  doc: PdfTabDocument,
  page: number,
  failure: PdfFailure,
): PdfTabDocument => {
  switch (failure) {
    case "closed":
      return doc;
    case "failed":
    case "missing":
    case "changed":
    case "unreadable":
    case "source":
    case "start":
      return withProblem(doc, problemOf(failure));
    default:
      return withFailedPage(doc, page);
  }
};

/**
 * withProblem returns `doc` showing `problem` instead of its pages
 */
export const withProblem = (
  doc: PdfTabDocument,
  problem: PdfProblem,
): PdfTabDocument => ({ ...doc, opened: null, problem });

/**
 * withFailedPage returns `doc` with the page `page` among those the helper
 * couldn't draw
 */
export const withFailedPage = (
  doc: PdfTabDocument,
  page: number,
): PdfTabDocument =>
  doc.failedPages.includes(page)
    ? doc
    : { ...doc, failedPages: [...doc.failedPages, page] };

/**
 * openingPdf returns the PDF at `path` while its helper opens it: nothing
 * opened yet, and no problem
 */
export const openingPdf = (path: string): PdfTabDocument => ({
  path,
  opened: null,
  problem: null,
  failedPages: [],
  signatures: null,
});

/**
 * openPdfDocument opens the PDF at `path` in the tab `tab`. It never throws:
 * a PDF that can't be opened gives a document with its problem, which is
 * logged by its kind.
 */
export const openPdfDocument = async (
  tab: string,
  path: string,
): Promise<PdfTabDocument> => {
  const doc = openingPdf(path);
  try {
    if (!(await exists(path))) return withProblem(doc, "missing");
    const opened = await openPdf(tab, path);
    // e.g. a file cut short: nothing to show
    if (!opened.pages.length) {
      logWarning("failed to open a PDF", "no pages");
      return withProblem(doc, "damaged");
    }
    return { ...doc, opened };
  } catch (error) {
    const failure = failureOf(error);
    // the tab closed, or opened it again, meanwhile: nothing went wrong
    if (failure !== "closed") logWarning("failed to open a PDF", failure);
    return withProblem(doc, problemOf(failure));
  }
};

// why a PDF's signatures weren't checked: its file changed, or was moved or
// deleted, after Blank opened it, or anything else
export type SignaturesUnchecked = "changed" | "missing" | "failed";

/**
 * checkSignatures checks the signatures of the PDF of the tab `tab`, which
 * shows `doc`; one that can't be checked is logged by its kind
 */
export const checkSignatures = async (
  tab: string,
  doc: PdfTabDocument,
): Promise<PdfTabDocument> => {
  try {
    return { ...doc, signatures: await verifyPdf(tab) };
  } catch (error) {
    const kind = signingKind(error);
    logWarning("failed to check the signatures of a PDF", kind);
    const signatures =
      kind === "fileChanged"
        ? "changed"
        : kind === "fileMissing"
          ? "missing"
          : "failed";
    return { ...doc, signatures };
  }
};

// what a PDF tab says in place of its pages, and what it offers: Open
// again, or Find it… for a file that has gone, and Close tab
export interface ProblemText {
  title: string;
  reason: string;
  find: boolean;
}

/**
 * problemText says why the PDF at `path` shows no pages
 */
export const problemText = (problem: PdfProblem, path: string): ProblemText => {
  const name = basename(path);
  const text = (title: string, reason: string, find = false) => ({
    title,
    reason,
    find,
  });
  switch (problem) {
    case "missing":
      return text(
        `${name} was moved or deleted`,
        "Blank can't find it where it was.",
        true,
      );
    case "unreadable":
      return text(
        `Blank can't read ${name}`,
        "It may have changed while Blank read it, or Blank isn't allowed to read it.",
      );
    case "changed":
      return text(
        `${name} changed`,
        "It changed after Blank opened it. Open it again to see it as it is now.",
      );
    case "damaged":
      return text(`Blank can't open ${name}`, "It isn't a PDF Blank can read.");
    case "tooComplex":
      return text(
        `${name} is too large or complex`,
        "Blank can't show it. Open it in another app.",
      );
    case "needsPassword":
      return text(
        "This PDF needs a password",
        "Blank can't open PDFs with a password yet.",
      );
    case "start":
      return text(
        "Blank's PDF viewer couldn't start",
        "Try again. If it keeps failing, install Blank again.",
      );
    case "stopped":
      return text(
        `Blank's PDF viewer stopped while it opened ${name}`,
        "The file may be damaged. Try again, or open it in another app.",
      );
    case "failed":
      return text(
        "Blank can't show this PDF any more",
        "Its viewer stopped twice while it showed this file.",
      );
  }
};
