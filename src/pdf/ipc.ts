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

// why a call failed, as the native side says it (`PdfError::kind`: e.g.
// "missingGlyphs" for a fill with characters the field's font can't show,
// "badRequest" for one the field can't take), or
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
  | "repaired"
  | "encrypted"
  | "missingGlyphs"
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

// a box on a page, [x, y, width, height] in display points
export type PdfRect = [number, number, number, number];

// a page's text: its words in reading order, and the thin horizontal lines
// drawn on it (at least 40 pt wide, at most 2 pt high), where people sign or
// write. Never logged: it is what the PDF says
export interface PageText {
  words: { text: string; rect: PdfRect }[];
  rules: PdfRect[];
}

/**
 * pageText reads the words and lines of the page `page` (from 0) of the tab
 * `tab`
 */
export const pageText = (tab: string, page: number) =>
  invoke<PageText>("pdf_text", { tab, page });

export type PdfFieldKind =
  "text" | "checkbox" | "radio" | "combo" | "list" | "button" | "signature";

// a field of a PDF's form, as protocol.rs's Field
export interface PdfField {
  // its full name, which a Fill names
  name: string;
  kind: PdfFieldKind;
  // its /TU, what it is called for people
  label: string | null;
  // its value: a checkbox's or radio button group's state ("Off" for none)
  value: string;
  // a choice's options
  options: string[];
  flags: {
    readOnly: boolean;
    required: boolean;
    multiline: boolean;
    comb: boolean;
    maxLen: number | null;
  };
  // a signature field that holds a signature
  signed: boolean;
  // where it shows; `onValue` is a checkbox's or radio button's state when on
  widgets: { page: number; rect: PdfRect; onValue: string | null }[];
}

/**
 * pdfFields reads the form's fields of the tab's PDF, with the values its
 * fills gave them
 */
export const pdfFields = (tab: string) =>
  invoke<PdfField[]>("pdf_fields", { tab });

// what a field (by its full name) is filled in with: a checkbox's true or
// false; text for a text field, a choice (one of its options, any text in a
// combo box that may be edited) and a radio button group (the `onValue` of
// the button chosen, "Off" for none)
export interface Fill {
  field: string;
  value: string | boolean;
}

/**
 * setFills fills the form of the tab's PDF in with `fills`, always the whole
 * set: the pages to draw again. Refused with "missingGlyphs" or
 * "badRequest", the last set stays. Values are never logged
 */
export const setFills = (tab: string, fills: Fill[]) =>
  invoke<number[]>("pdf_set_fills", { tab, fills });
