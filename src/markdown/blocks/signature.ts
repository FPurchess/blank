import type { Attrs } from "prosemirror-model";

import { formatSigningDate, type DateFormat } from "../../signing/date";
import { calendarDate } from "./atoms";

// What a signature block (ATOMS.signature in ./atoms.ts) says: the lines
// under its line, and how screen readers and Blank name it. The pages, the
// PDF, the Word export and the editor's DOM all take its words from here.

// what a block says before it is signed, and on the screen only
export const SIGNATURE_HINT = "Signature";

// the room for the signature above the line, in points, and the share of
// the text's width a block takes when it doesn't say: the layout engine's
// (SIGNATURE_ROOM and SIGNATURE_SHARE in
// src-tauri/layout/src/items/signature.rs, which signature.parity.test.ts
// compares), for the Word export
export const SIGNATURE_ROOM = 42;
export const SIGNATURE_SHARE = 0.5;

/**
 * signatureShare returns the share of the text's width a block says it
 * takes, or 0 when it doesn't, for the default
 */
export const signatureShare = (attrs: Attrs) => {
  const percent = /^(\d+)%$/.exec((attrs.width as string | null) ?? "");
  return percent ? Math.min(Number(percent[1]), 100) / 100 : 0;
};

// how dates are written: Settings ▸ Signing ▸ Date, in the document's
// language
export interface DateStyle {
  format: DateFormat;
  language: string;
}

// what fills a block when it is signed: the signer's name, where and when,
// written as `format` says in `language`
export interface Signing extends DateStyle {
  name: string;
  place: string;
  date: Date;
}

// how dates are written where nothing says, e.g. in the editor's DOM
const ISO: DateStyle = { format: "iso", language: "" };

// what is left to write by hand
const BLANK = "____________";

/**
 * signerOf returns who signs on a block: the name it gives, or the signer's
 * when it gives none and it is being signed
 */
const signerOf = (attrs: Attrs, signing?: Signing) =>
  (attrs.name as string) || signing?.name || "";

/**
 * signatureLines returns the lines under a block's line: who signs and as
 * what, then where and when, its dates written as `dates` (or the
 * signing's) say. What is to come is a line to write by hand: unsigned, a
 * place or a date to come; and a date the block leaves blank, signed or not.
 */
export const signatureLines = (
  attrs: Attrs,
  { dates, signing }: { dates?: DateStyle; signing?: Signing } = {},
) => {
  const lines: string[] = [];
  const who = [signerOf(attrs, signing), attrs.role as string]
    .filter(Boolean)
    .join(" · ");
  if (who) lines.push(who);
  const style = signing ?? dates ?? ISO;
  const write = (date: Date) =>
    formatSigningDate(date, style.language, style.format);
  const place = (attrs.place as string) || signing?.place || "";
  const date = attrs.date as string;
  const fixed =
    date === "signing" || date === "none" ? null : calendarDate(date);
  const when = fixed
    ? write(fixed)
    : date === "signing" && signing
      ? write(signing.date)
      : "";
  if (when && (place || signing)) {
    lines.push([place, when].filter(Boolean).join(", "));
  } else if (place) {
    lines.push(`${place}, ${BLANK}`);
  } else {
    lines.push(when ? `${BLANK}, ${when}` : `Place, date: ${BLANK}`);
  }
  return lines;
};

/**
 * signatureLabel returns what a block is called for screen readers and in
 * Blank's messages, e.g. "Signature of Ada Lovelace, Tenant"
 */
export const signatureLabel = (attrs: Attrs) => {
  const who = [attrs.name as string, attrs.role as string].filter(Boolean);
  return who.length ? `Signature of ${who.join(", ")}` : SIGNATURE_HINT;
};
