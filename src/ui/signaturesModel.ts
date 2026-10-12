import type { SignaturesUnchecked } from "../pdf/document";
import type { CheckedSignature, Trust } from "../signing/ipc";

// What the status bar, the signatures popover and a signature's details say
// of a PDF's signatures (SignaturesStatus.vue, SignaturesPopover.vue,
// SignatureDetailsDialog.vue), as Blank checked them (see
// .claude/rules/signing.md): own and trusted certificates are "valid";
// others are only "intact", since Blank checks neither certificate
// authorities nor revocation.

// how a signature, or all of a PDF's, looks: fine, fine but with a doubt
// (a signer Blank doesn't know, a weak algorithm, later changes another
// signature signed), or not fine
export type SignatureLook = "ok" | "unknown" | "bad";

const known = (trust: Trust) =>
  trust.kind === "own" || trust.kind === "trusted";
const intact = (signature: CheckedSignature) =>
  signature.status === "valid" || signature.status === "signedAgainLater";
const later = (signature: CheckedSignature) =>
  signature.laterSigner ?? "someone else";

/**
 * lookOf returns how a signature looks
 */
export const lookOf = (signature: CheckedSignature): SignatureLook =>
  !intact(signature)
    ? "bad"
    : known(signature.trust) &&
        signature.status === "valid" &&
        signature.weak === null
      ? "ok"
      : "unknown";

// why the signatures weren't checked, after "Signatures not checked"
const uncheckedBecause: Record<SignaturesUnchecked, string> = {
  changed: ": the file changed",
  missing: ": the file is gone",
  failed: "",
};

/**
 * signaturesLabel returns what the status bar says of a PDF's signatures,
 * null while they are checked
 */
export const signaturesLabel = (
  signatures: readonly CheckedSignature[] | SignaturesUnchecked | null,
): { text: string; icon: string; look: SignatureLook } | null => {
  if (signatures === null) return null;
  if (typeof signatures === "string")
    return {
      text: `Signatures not checked${uncheckedBecause[signatures]}`,
      icon: "seal-off",
      look: "bad",
    };
  if (signatures.length === 0)
    return { text: "Not signed", icon: "", look: "ok" };
  if (signatures.some((signature) => signature.status === "invalid"))
    return { text: "Signature invalid", icon: "seal-off", look: "bad" };
  if (signatures.some((signature) => !intact(signature)))
    return { text: "Changed after signing", icon: "seal-off", look: "bad" };
  if (signatures.some((signature) => signature.weak !== null))
    return { text: "Weak signature", icon: "seal-off", look: "unknown" };
  if (signatures.some((signature) => signature.status === "signedAgainLater"))
    return { text: "Changed and signed again", icon: "seal", look: "unknown" };
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
 * e.g. "Intact · says it's issued by DigiCert": Blank doesn't check the
 * issuer, so it only repeats what the certificate claims
 */
export const signatureStatus = (signature: CheckedSignature) => {
  if (signature.status === "invalid")
    return "Signature invalid: it doesn't match the PDF";
  if (signature.status === "changedAfterSigning")
    return "Changed after signing";
  if (signature.weak !== null) return `Weak: ${signature.weak} can be forged`;
  const intactAs = known(signature.trust) ? "Valid" : "Intact";
  if (signature.status === "signedAgainLater")
    return `${intactAs} for the version it signed; changed and signed again later by ${later(signature)}`;
  switch (signature.trust.kind) {
    case "own":
      return "Valid · your certificate";
    case "trusted":
      return "Valid · a certificate you trust";
    case "issuedBy":
      return `Intact · says it's issued by ${signature.trust.issuer}`;
    case "unknown":
      return "Intact · signer unknown";
  }
};

/**
 * signatureVerdict returns the details' sentences on a signature
 */
export const signatureVerdict = (signature: CheckedSignature) => {
  if (signature.status === "invalid")
    return "The signature doesn't match the PDF.";
  if (signature.status === "changedAfterSigning")
    return "The PDF was changed after it was signed.";
  const sentences = [
    signature.status === "signedAgainLater"
      ? `${known(signature.trust) ? "Valid" : "Intact"} for the version it signed; changed and signed again later by ${later(signature)}.`
      : signature.laterSigner
        ? `The PDF hasn't changed since it was signed, only signed again by ${signature.laterSigner}.`
        : "The PDF hasn't changed since it was signed.",
    known(signature.trust)
      ? "The certificate is one Blank trusts."
      : "Blank doesn't know this certificate.",
  ];
  if (signature.weak !== null)
    sentences.push(
      `It relies on ${signature.weak}, whose signatures can be forged: don't rely on it.`,
    );
  return sentences.join(" ");
};

/**
 * signerName returns who signed, as the popover and the details name them
 */
export const signerName = (signature: CheckedSignature) =>
  signature.name ?? "Someone unknown";

/**
 * clockOf says whose clock gave a signature's time: the computer's, or a
 * timestamp server's, named, and "not checked" unless the user trusts its
 * certificate (Blank checks that a timestamp is intact, not who made it)
 */
const clockOf = (signature: CheckedSignature) => {
  if (!signature.timestamped) return "computer clock";
  const by = `timestamped by ${signature.timestampAuthority ?? "an unknown server"}`;
  return signature.timestampTrusted ? by : `${by} (not checked)`;
};

/**
 * signedWhen returns when a signature was made and by whose clock, e.g.
 * "8 Oct 2026, 14:00 · timestamped by DigiCert (not checked)", in `locale`
 */
export const signedWhen = (signature: CheckedSignature, locale?: string) => {
  const clock = clockOf(signature);
  if (!signature.time) return clock;
  const time = new Date(signature.time);
  if (Number.isNaN(time.getTime())) return clock;
  return `${time.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })} · ${clock}`;
};

/**
 * canTrust is whether the details offer to trust a signature's certificate:
 * one Blank doesn't trust yet, of a signature that is intact
 */
export const canTrust = (signature: CheckedSignature) =>
  intact(signature) &&
  !known(signature.trust) &&
  signature.certificateDer !== null;
