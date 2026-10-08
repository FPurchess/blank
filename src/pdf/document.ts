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
  // not a PDF the helper can read
  | "damaged"
  | "needsPassword"
  // the helper couldn't be started
  | "start"
  // the helper failed twice on it
  | "failed";

export interface PdfTabDocument {
  readonly path: string;
  // what opening it found; null while it has a problem
  readonly opened: OpenedPdf | null;
  readonly problem: PdfProblem | null;
  // the pages the helper couldn't draw (from 0), not asked for again
  readonly failedPages: readonly number[];
  // its signatures as Blank checked them: null until they are, "failed" if
  // they couldn't be
  readonly signatures: readonly CheckedSignature[] | "failed" | null;
}

/**
 * problemOf returns the problem of a PDF the helper couldn't open
 */
export const problemOf = (failure: PdfFailure): PdfProblem => {
  switch (failure) {
    case "needsPassword":
    case "start":
    case "unreadable":
    case "failed":
      return failure;
    case "source":
      return "unreadable";
    case "crashed":
    case "hung":
      return "failed";
    default:
      return "damaged";
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
 * openPdfDocument opens the PDF at `path` in the tab `tab`. It never throws:
 * a PDF that can't be opened gives a document with its problem, which is
 * logged by its kind.
 */
export const openPdfDocument = async (
  tab: string,
  path: string,
): Promise<PdfTabDocument> => {
  const doc = {
    path,
    opened: null,
    problem: null,
    failedPages: [],
    signatures: null,
  };
  try {
    if (!(await exists(path))) return withProblem(doc, "missing");
    return { ...doc, opened: await openPdf(tab, path) };
  } catch (error) {
    const failure = failureOf(error);
    logWarning("failed to open a PDF", failure);
    return withProblem(doc, problemOf(failure));
  }
};

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
    logWarning("failed to check the signatures of a PDF", signingKind(error));
    return { ...doc, signatures: "failed" };
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
    case "damaged":
      return text(`Blank can't open ${name}`, "It isn't a PDF Blank can read.");
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
    case "failed":
      return text(
        "Blank can't show this PDF any more",
        "Its viewer stopped twice while it showed this file.",
      );
  }
};
