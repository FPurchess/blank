import { invoke } from "@tauri-apps/api/core";

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

// how to sign, besides the PDF and the passphrase
export interface SignOptions {
  // the page of the signature's field, from 1
  page: number;
  // where the signature shows, in points from the page's top left; none for
  // an invisible signature
  rect: [number, number, number, number] | null;
  location: string | null;
  reason: string | null;
  // an RFC 3161 server, for a timestamp
  timestampServer: string | null;
}

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
 * signPdf signs `pdf` with the user's key and returns the signed PDF
 */
export const signPdf = async (
  pdf: Uint8Array,
  passphrase: string,
  options: SignOptions,
) =>
  new Uint8Array(
    await invoke<ArrayBuffer>("signing_sign_pdf", pdf, {
      headers: {
        "blank-signing": encodeURIComponent(
          JSON.stringify({ passphrase, options }),
        ),
      },
    }),
  );

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
  // for signedAgainLater: who signed next, after the changes
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
