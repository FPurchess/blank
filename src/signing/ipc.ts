import { invoke } from "@tauri-apps/api/core";

import type { Fill, PdfRect } from "../pdf/ipc";

// The calls to the native side's signing (src-tauri/src/signing/commands.rs),
// in one place. The key never comes here: the passphrase goes there once
// per signing, and the signed PDF comes back.

// what the webview shows of the user's certificate
export interface CertificateInfo {
  name: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  selfSigned: boolean;
  // SHA-256 of the certificate, in capital hex
  fingerprint: string;
}

// what went wrong, as the native side says it
export type SigningError =
  | { kind: "wrongPassphrase" }
  | { kind: "noCertificate" }
  // the user has a key, which only a call that replaces it replaces
  | { kind: "keyExists" }
  // the timestamp server gave no timestamp that holds: signing without one
  // works
  | { kind: "timestamp"; message: string }
  // a PDF tab's file changed, or was moved or deleted, after Blank opened it
  | { kind: "fileChanged" }
  | { kind: "fileMissing" }
  | { kind: "failed"; message: string };

/**
 * isSigningError tells whether `error` is one the native side sent
 */
const isSigningError = (error: unknown): error is SigningError =>
  !!error &&
  typeof error === "object" &&
  "kind" in error &&
  [
    "wrongPassphrase",
    "noCertificate",
    "keyExists",
    "timestamp",
    "fileChanged",
    "fileMissing",
    "failed",
  ].includes((error as { kind: string }).kind);

/**
 * signingKind returns what kind of error the native side sent, for the
 * log, which never gets more of it: "other" for an error of the webview
 */
export const signingKind = (error: unknown) =>
  isSigningError(error) ? error.kind : "other";

/**
 * forTheLog returns what the log gets of an error: an error of the native
 * side by its kind only, since its text may quote what the crypto crates
 * got; one of the webview as it is
 */
export const forTheLog = (error: unknown) =>
  isSigningError(error) ? error.kind : error;

/**
 * signingMessage says what went wrong, in words for the user, `fallback`
 * (e.g. "Blank couldn't back up your key") for what the native side didn't
 * say
 */
export const signingMessage = (error: unknown, fallback: string) => {
  if (!isSigningError(error)) return fallback;
  switch (error.kind) {
    case "wrongPassphrase":
      return "The passphrase is wrong";
    case "noCertificate":
      return "You have no certificate to sign with";
    case "keyExists":
      return "You have a key already";
    case "fileChanged":
      return "The PDF changed after Blank opened it";
    case "fileMissing":
      return "The PDF was moved or deleted after Blank opened it";
    case "timestamp":
    case "failed":
      return error.message;
  }
};

// a stamp to put in the pages' content: the one-page PDF of the body's
// part `part`, on page `page` (from 1); `repeat` puts it on every page at
// the same place, moved into smaller pages
export interface StampPlan {
  part: number;
  page: number;
  rect: PdfRect;
  repeat: boolean;
}

// where the signature goes: nowhere on the pages, an empty signature field
// the PDF has (its full name), or a new field; `stamp` is the body's part
// with the stamp it shows
export type SignaturePlan =
  | { kind: "invisible" }
  | { kind: "existing"; field: string; stamp?: number | null }
  | { kind: "new"; page: number; rect: PdfRect; stamp?: number | null };

// an empty signature field for someone else to sign later, called
// "Signature of ‹name›"
export interface OtherSigner {
  page: number;
  rect: PdfRect;
  name: string;
}

// what to add to the PDF, and what the signature says
export interface SignPlan {
  stamps: StampPlan[];
  signature: SignaturePlan;
  others: OtherSigner[];
  location: string | null;
  reason: string | null;
  // an RFC 3161 server, for a timestamp
  timestampServer: string | null;
}

// where the PDF comes from: the body's part 0 (an export), or a PDF tab's
// file, which must still be the one it opened, with the tab's fills
export type SignSource =
  | { kind: "body" }
  | { kind: "tab"; tab: string; path: string; sha256: string; fills: Fill[] };

export interface SignRequest {
  // null: the stamps and fields alone, no signature
  passphrase: string | null;
  source: SignSource;
  plan: SignPlan;
}

/**
 * encodeParts packs `parts` into one body: a little-endian u32 count, then
 * each part as a little-endian u64 length and its bytes
 */
export const encodeParts = (parts: Uint8Array[]) => {
  const size = parts.reduce((sum, part) => sum + 8 + part.length, 4);
  const body = new Uint8Array(size);
  const view = new DataView(body.buffer);
  view.setUint32(0, parts.length, true);
  let at = 4;
  for (const part of parts) {
    view.setBigUint64(at, BigInt(part.length), true);
    body.set(part, at + 8);
    at += 8 + part.length;
  }
  return body;
};

export const certificate = () =>
  invoke<CertificateInfo | null>("signing_certificate");

// `replace`: the user's key is replaced, once they said so; else a key
// there fails with keyExists
export const createCertificate = (
  name: string,
  email: string | null,
  passphrase: string,
  replace: boolean,
) =>
  invoke<CertificateInfo>("signing_create_certificate", {
    name,
    email,
    passphrase,
    replace,
  });

export const importKey = (path: string, passphrase: string, replace: boolean) =>
  invoke<CertificateInfo>("signing_import", { path, passphrase, replace });

// `key`: the whole key file, as a backup; else the certificate alone, for
// others to trust
export const exportCertificate = (key: boolean, path: string) =>
  invoke<void>("signing_export", { key, path });

export const removeCertificate = () => invoke<void>("signing_remove");

export const checkPassphrase = (passphrase: string) =>
  invoke<void>("signing_check_passphrase", { passphrase });

/**
 * signPdf adds `request.plan` to a PDF and signs it with the user's key, or
 * without a passphrase adds the stamps and fields alone, and returns the
 * PDF. `parts` are the body: for `source.kind` "body" the PDF first, then
 * the stamps' PDFs, which `plan` names by their index in `parts`.
 */
export const signPdf = async (request: SignRequest, parts: Uint8Array[]) =>
  new Uint8Array(
    await invoke<ArrayBuffer>("signing_sign_pdf", encodeParts(parts), {
      headers: {
        "blank-signing": encodeURIComponent(JSON.stringify(request)),
      },
    }),
  );

// what may be placed on a PDF a tab shows (`signing_pdf_rules`, see
// .claude/rules/pdf.md, "Stamps"): whether it is signed already, its DocMDP permission (1: no changes,
// 2: filling in and signing, 3: annotations too), whether it's encrypted or
// would need repairing, and the fields earlier signatures locked
export interface PdfRules {
  signed: boolean;
  docmdp: number | null;
  encrypted: boolean;
  damaged: boolean;
  locked: string[];
}

// `sha256`: the PDF the tab opened, else it fails `fileChanged` or
// `fileMissing`
export const pdfRules = (path: string, sha256: string) =>
  invoke<PdfRules>("signing_pdf_rules", { path, sha256 });

// how far Blank trusts who signed (src-tauri/src/signing/trust.rs): the
// user's own certificate, one they trusted, one a certificate authority
// issued (which Blank doesn't check), or an unknown self-signed one
export type Trust =
  | { kind: "own" }
  | { kind: "trusted" }
  | { kind: "issuedBy"; issuer: string }
  | { kind: "unknown" };

// what a signature says of the PDF: intact, intact for the version it
// signed with the later changes signed by someone else, intact but changed
// later, or not matching the PDF
export type SignatureStatus =
  "valid" | "signedAgainLater" | "changedAfterSigning" | "invalid";

// a signature of a PDF, as Blank checked it
export interface CheckedSignature {
  field: string;
  name: string | null;
  // ISO 8601: the timestamp's time, else the signer's clock (without an
  // offset when the PDF gives none)
  time: string | null;
  timestamped: boolean;
  // who timestamped it, and whether that's a certificate the user trusts:
  // else the time is the timestamp's word, not checked
  timestampAuthority: string | null;
  timestampTrusted: boolean;
  // the weak algorithm it relies on ("SHA-1"), if it does
  weak: string | null;
  // for signedAgainLater, and for a valid one that later revisions only
  // signed again: who signed next
  laterSigner: string | null;
  reason: string | null;
  location: string | null;
  status: SignatureStatus;
  trust: Trust;
  certificate: CertificateInfo | null;
  // the certificate, DER in hex, to trust it
  certificateDer: string | null;
}

export const readTrusted = () => invoke<CertificateInfo[]>("signing_trusted");

export const trustCertificate = (der: string) =>
  invoke<CertificateInfo>("signing_trust", { der });

export const untrustCertificate = (fingerprint: string) =>
  invoke<void>("signing_untrust", { fingerprint });
