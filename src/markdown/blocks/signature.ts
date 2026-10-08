import type { Attrs } from "prosemirror-model";

import { formatSigningDate, type DateFormat } from "../../signing/date";

// What a signature block (ATOMS.signature in ./atoms.ts) says: the lines
// under its line, and how screen readers and Blank name it. The pages, the
// PDF, the Word export and the editor's DOM all take its words from here.

// what a block says before it is signed, and on the screen only
export const SIGNATURE_HINT = "Signature";

// the room for the signature above the line, in points, and the share of
// the text's width a block takes when it doesn't say: as the layout engine
// has them (SIGNATURE_ROOM and SIGNATURE_SHARE in
// src-tauri/layout/src/items/signature.rs), for the Word export
export const SIGNATURE_ROOM = 42;
export const SIGNATURE_SHARE = 0.5;

/**
 * signatureShare returns the share of the text's width a block takes
 */
export const signatureShare = (attrs: Attrs) => {
  const percent = /^(\d+)%$/.exec((attrs.width as string | null) ?? "");
  return percent ? Math.min(Number(percent[1]), 100) / 100 : SIGNATURE_SHARE;
};

// what fills a block when it is signed: the signer's name, where and when
export interface Signing {
  name: string;
  place: string;
  date: Date;
  format: DateFormat;
  language: string;
}

/**
 * signerOf returns who signs on a block: the name it gives, or the signer's
 * when it gives none and it is being signed
 */
const signerOf = (attrs: Attrs, signing?: Signing) =>
  (attrs.name as string) || signing?.name || "";

/**
 * signatureLines returns the lines under a block's line: who signs and as
 * what, then where and when. Unsigned, a place or date to come is a line to
 * write it by hand.
 */
export const signatureLines = (attrs: Attrs, signing?: Signing) => {
  const lines: string[] = [];
  const who = [signerOf(attrs, signing), attrs.role as string]
    .filter(Boolean)
    .join(" · ");
  if (who) lines.push(who);
  const place = (attrs.place as string) || signing?.place || "";
  const date = attrs.date as string;
  const when =
    date === "signing"
      ? signing
        ? formatSigningDate(signing.date, signing.language, signing.format)
        : ""
      : date === "none"
        ? ""
        : signing
          ? formatSigningDate(
              new Date(`${date}T12:00:00`),
              signing.language,
              signing.format,
            )
          : date;
  const parts = [place, when].filter(Boolean);
  if (parts.length === 2 || (parts.length === 1 && signing)) {
    lines.push(parts.join(", "));
  } else {
    // what is left to write by hand
    const blank = "____________";
    lines.push(
      place
        ? `${place}, ${blank}`
        : when
          ? `${blank}, ${when}`
          : `Place, date: ${blank}`,
    );
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
