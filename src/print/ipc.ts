import { invoke } from "@tauri-apps/api/core";

import type { Size } from "./sheets";

// The system's print dialog, through src-tauri/src/print/: `print_prepare`
// shows it on Linux, where the print portal asks before it gets the PDF, and
// `print_send` hands it the PDF (and shows it on macOS and Windows). The
// types mirror the Rust ones.

// what the system's dialog starts with
export interface Preset {
  copies: number;
  // whether each copy prints whole before the next
  collate: boolean;
  // whether the pages are fitted to the paper, by macOS's panel; Linux
  // fits them in the PDF (see PrintSetup's paper), Windows' dialog itself
  fit: boolean;
  // the sheets' paper, in points, as Blank lays them out
  paper: Size;
}

export type PrintSetup =
  | {
      outcome: "ready";
      // what the print portal hands back with the PDF; none elsewhere
      token: number | null;
      // the paper the user chose there, in points
      paper: Size | null;
      // the sheets to print, 0-based and inclusive
      ranges: [number, number][] | null;
      // in percent
      scale: number | null;
    }
  | { outcome: "cancelled" };

export type Sent =
  // the system took the job, with the printer's name if it says
  | { outcome: "sent"; printer: string | null }
  // the system's dialog is open, and Blank won't learn more (Windows)
  | { outcome: "shown" }
  | { outcome: "cancelled" };

export interface PrintError {
  // noService: Linux has no print portal; unsupported: Windows' WebView2
  // can't show its print dialog; uncertain: the job may have printed; a PDF
  // tab's file (printPdfTab): notOpen, missing (moved or deleted), changed
  // (another PDF than the tab shows)
  kind:
    | "noService"
    | "unsupported"
    | "uncertain"
    | "failed"
    | "notOpen"
    | "missing"
    | "changed";
  message: string;
}

/**
 * isPrintError tells a PrintError from other errors
 */
export const isPrintError = (error: unknown): error is PrintError =>
  typeof error === "object" &&
  error !== null &&
  typeof (error as PrintError).kind === "string" &&
  typeof (error as PrintError).message === "string";

/**
 * preparePrint asks the system's print dialog what to print, on Linux; it
 * is ready at once elsewhere
 */
export const preparePrint = (title: string, preset: Preset) =>
  invoke<PrintSetup>("print_prepare", { title, preset });

/**
 * sendPrint hands the PDF to the system's print dialog. The PDF goes as the
 * raw body, the rest in a header, encoded since headers carry only Latin-1.
 */
export const sendPrint = (
  pdf: Uint8Array,
  meta: { token: number | null; title: string; preset: Preset },
) =>
  invoke<Sent>("print_send", pdf, {
    headers: { "x-print": encodeURIComponent(JSON.stringify(meta)) },
  });

export type PdfPrinted =
  | Sent
  // the system's dialog (Linux) chose some pages or a scale, which Blank
  // can't apply to a PDF it didn't write: nothing printed
  | { outcome: "whole" };

/**
 * printPdfTab prints the PDF tab `tab`'s file as it is, while it is the PDF
 * the tab opened: the native side reads it (so a large PDF never travels
 * through the webview), asks the system's dialog on Linux, and hands it over
 */
export const printPdfTab = (
  tab: string,
  meta: { title: string; preset: Preset },
) => invoke<PdfPrinted>("pdf_print", { tab, meta: { token: null, ...meta } });
