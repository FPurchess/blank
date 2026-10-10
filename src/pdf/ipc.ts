import { invoke } from "@tauri-apps/api/core";

import type { CheckedSignature } from "../signing/ipc";

// The calls to the native side of the PDF tabs (src-tauri/src/pdf_view), in
// one place. Each PDF tab has a helper of its own there, which draws its
// pages with MuPDF (see .claude/rules/pdf.md). Sizes are in display points:
// from the top left of a page as it shows, turned by its /Rotate.

// a page of a PDF
export interface PdfPage {
  width: number;
  height: number;
  rotation: number;
}

// what opening a PDF found
export interface OpenedPdf {
  // the file's SHA-256, which tells whether it changed since
  sha256: string;
  pages: PdfPage[];
  // the file had to be repaired to be read
  repaired: boolean;
  encrypted: boolean;
}

// why a call failed, as the native side says it (`PdfError::kind`), or
// "unreadable" for a file that can't be read, "closed" for a tab whose PDF
// was closed meanwhile, and for a file read again (a helper that stopped
// opens it again) "missing" when it has gone, "changed" when it holds
// another PDF than the one opened
export type PdfFailure =
  | "unreadable"
  | "missing"
  | "changed"
  | "closed"
  | "badRequest"
  | "unknownOp"
  | "needsPassword"
  | "damaged"
  | "tooComplex"
  | "cancelled"
  | "engine"
  | "timedOut"
  | "crashed"
  | "hung"
  | "failed"
  | "start"
  | "source";

/**
 * failureOf returns the kind of failure the native side sent, "engine" for
 * any other error, e.g. of the webview
 */
export const failureOf = (error: unknown): PdfFailure =>
  typeof error === "string" ? (error as PdfFailure) : "engine";

/**
 * openPdf opens the PDF at `path` in the tab `tab`, with a helper of its
 * own; one it had before stops
 */
export const openPdf = (tab: string, path: string) =>
  invoke<OpenedPdf>("pdf_open", { tab, path });

// a page's pixels as the helper drew them
export interface PageBitmap {
  width: number;
  height: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

/**
 * readBitmap reads what pdf_render sends: the pixels, RGBA, then their
 * width and height as two u32 LE
 */
export const readBitmap = (buffer: ArrayBuffer): PageBitmap => {
  const sizes = new DataView(buffer, buffer.byteLength - 8);
  const width = sizes.getUint32(0, true);
  const height = sizes.getUint32(4, true);
  return {
    width,
    height,
    pixels: new Uint8ClampedArray(buffer, 0, width * height * 4),
  };
};

/**
 * renderPage draws the page `page` (from 0) of the tab `tab` at `scale`
 * device pixels per point; `ticket` lets cancelRender stop it
 */
export const renderPage = async (
  tab: string,
  page: number,
  scale: number,
  ticket: number,
): Promise<PageBitmap> =>
  readBitmap(
    await invoke<ArrayBuffer>("pdf_render", { tab, page, scale, ticket }),
  );

/**
 * cancelRender stops the render of `ticket` in the tab `tab` if it runs
 */
export const cancelRender = (tab: string, ticket: number) =>
  invoke<void>("pdf_cancel", { tab, ticket });

/**
 * closePdf stops the tab's helper and forgets its PDF
 */
export const closePdf = (tab: string) => invoke<void>("pdf_close", { tab });

/**
 * verifyPdf checks the signatures of the tab's PDF, read again from its file
 */
export const verifyPdf = (tab: string) =>
  invoke<CheckedSignature[]>("pdf_verify", { tab });
