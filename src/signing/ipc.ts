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
  | { kind: "failed"; message: string };

/**
 * isSigningError tells whether `error` is one the native side sent
 */
export const isSigningError = (error: unknown): error is SigningError =>
  !!error &&
  typeof error === "object" &&
  "kind" in error &&
  ["wrongPassphrase", "noCertificate", "failed"].includes(
    (error as { kind: string }).kind,
  );

/**
 * signingMessage says what went wrong, in words for the user
 */
export const signingMessage = (error: unknown) => {
  if (!isSigningError(error)) return "Blank couldn't sign the PDF";
  switch (error.kind) {
    case "wrongPassphrase":
      return "The passphrase is wrong";
    case "noCertificate":
      return "You have no certificate to sign with";
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
  name: string | null;
  location: string | null;
  reason: string | null;
  // an RFC 3161 server, for a timestamp
  timestampServer: string | null;
}

export const certificate = () =>
  invoke<CertificateInfo | null>("signing_certificate");

export const createCertificate = (
  name: string,
  email: string | null,
  passphrase: string,
) =>
  invoke<CertificateInfo>("signing_create_certificate", {
    name,
    email,
    passphrase,
  });

export const importKey = (path: string, passphrase: string) =>
  invoke<CertificateInfo>("signing_import", { path, passphrase });

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
