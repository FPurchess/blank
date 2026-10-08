import type { CertificateInfo, CheckedSignature, Trust } from "../signing/ipc";

// What the status bar, the signatures popover and a signature's details say
// of a PDF's signatures (SignaturesStatus.vue, SignaturesPopover.vue,
// SignatureDetailsDialog.vue), as Blank checked them (see
// .claude/rules/signing.md): own and trusted certificates are "valid";
// others are only "intact", since Blank checks neither certificate
// authorities nor revocation.

// how a signature, or all of a PDF's, looks: fine, fine but from someone
// Blank doesn't know, or not fine
export type SignatureLook = "ok" | "unknown" | "bad";

const known = (trust: Trust) =>
  trust.kind === "own" || trust.kind === "trusted";
const intact = (signature: CheckedSignature) =>
  signature.status === "valid" || signature.status === "signedAgainLater";

/**
 * lookOf returns how a signature looks
 */
export const lookOf = (signature: CheckedSignature): SignatureLook =>
  !intact(signature) ? "bad" : known(signature.trust) ? "ok" : "unknown";

/**
 * signaturesLabel returns what the status bar says of a PDF's signatures,
 * null while they are checked
 */
export const signaturesLabel = (
  signatures: readonly CheckedSignature[] | "failed" | null,
): { text: string; icon: string; look: SignatureLook } | null => {
  if (signatures === null) return null;
  if (signatures === "failed")
    return { text: "Signatures not checked", icon: "seal-off", look: "bad" };
  if (signatures.length === 0)
    return { text: "Not signed", icon: "", look: "ok" };
  if (signatures.some((signature) => signature.status === "invalid"))
    return { text: "Signature invalid", icon: "seal-off", look: "bad" };
  if (signatures.some((signature) => !intact(signature)))
    return { text: "Changed after signing", icon: "seal-off", look: "bad" };
  if (signatures.every((signature) => known(signature.trust)))
    return {
      text:
        signatures.length === 1 ? "Signed" : `Signed by ${signatures.length}`,
      icon: "seal",
      look: "ok",
    };
  return { text: "Signed, signer unknown", icon: "seal", look: "unknown" };
};

/**
 * signatureStatus returns what a signature says of the PDF and its signer,
 * e.g. "Intact · issued by DigiCert"
 */
export const signatureStatus = (signature: CheckedSignature) => {
  if (signature.status === "invalid")
    return "Signature invalid: it doesn't match the PDF";
  if (signature.status === "changedAfterSigning")
    return "Changed after signing";
  switch (signature.trust.kind) {
    case "own":
      return "Valid · your certificate";
    case "trusted":
      return "Valid · a certificate you trust";
    case "issuedBy":
      return `Intact · issued by ${signature.trust.issuer}`;
    case "unknown":
      return "Intact · signer unknown";
  }
};

/**
 * signatureVerdict returns the details' sentence on a signature
 */
export const signatureVerdict = (signature: CheckedSignature) => {
  if (signature.status === "invalid")
    return "The signature doesn't match the PDF.";
  if (signature.status === "changedAfterSigning")
    return "The PDF was changed after it was signed.";
  return known(signature.trust)
    ? "The PDF hasn't changed since it was signed, and the certificate is one Blank trusts."
    : "The PDF hasn't changed since it was signed, but Blank doesn't know this certificate.";
};

/**
 * signerName returns who signed, as the popover and the details name them
 */
export const signerName = (signature: CheckedSignature) =>
  signature.name ?? "Someone unknown";

/**
 * signedWhen returns when a signature was made and by whose clock, e.g.
 * "8 Oct 2026, 14:00 · timestamped", in `locale`
 */
export const signedWhen = (signature: CheckedSignature, locale?: string) => {
  const clock = signature.timestamped ? "timestamped" : "computer clock";
  if (!signature.time) return clock;
  const time = new Date(signature.time);
  if (Number.isNaN(time.getTime())) return clock;
  return `${time.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })} · ${clock}`;
};

/**
 * certificateLine returns how the details name a certificate, e.g.
 * "Acme GmbH · issued by DigiCert" or "Maria Keller · self-signed"
 */
export const certificateLine = (certificate: CertificateInfo) =>
  `${certificate.name} · ${certificate.selfSigned ? "self-signed" : `issued by ${certificate.issuer}`}`;

/**
 * canTrust is whether the details offer to trust a signature's certificate:
 * one Blank doesn't trust yet, of a signature that is intact
 */
export const canTrust = (signature: CheckedSignature) =>
  lookOf(signature) === "unknown" && signature.certificateDer !== null;

/**
 * validity returns how long a certificate is valid, e.g. "Oct 2026 – Oct
 * 2031", in `locale`; a date that can't be read as it was written
 */
export const validity = (certificate: CertificateInfo, locale?: string) => {
  const month = (text: string) => {
    const date = new Date(text);
    return Number.isNaN(date.getTime())
      ? text
      : date.toLocaleDateString(locale, { month: "short", year: "numeric" });
  };
  return `${month(certificate.notBefore)} – ${month(certificate.notAfter)}`;
};
