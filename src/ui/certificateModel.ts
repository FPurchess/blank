import type { CertificateInfo } from "../signing/ipc";

// How Blank writes a certificate wherever it shows one: the user's own in
// Settings ▸ Signing (CertificateRows.vue) and a signer's in a signature's
// details (SignatureDetailsDialog.vue), with CopyFingerprint.vue for its
// fingerprint.

/**
 * groupFingerprint writes a fingerprint in groups of four, to read it out
 */
export const groupFingerprint = (fingerprint: string) =>
  fingerprint.match(/.{1,4}/g)?.join(" ") ?? fingerprint;

/**
 * issuedBy says who issued a certificate, e.g. "issued by DigiCert" or
 * "self-signed"; the issuer is only what the certificate claims
 */
const issuedBy = (info: Pick<CertificateInfo, "selfSigned" | "issuer">) =>
  info.selfSigned ? "self-signed" : `issued by ${info.issuer}`;

/**
 * certificateLine returns how the details name a certificate, e.g.
 * "Acme GmbH · issued by DigiCert" or "Maria Keller · self-signed"
 */
export const certificateLine = (certificate: CertificateInfo) =>
  `${certificate.name} · ${issuedBy(certificate)}`;

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

/**
 * certificateSummary says who made the user's own certificate and until
 * when it's valid, e.g. "Made by Blank, valid until 2031-10-08"
 */
export const certificateSummary = (
  info: Pick<CertificateInfo, "selfSigned" | "issuer" | "notAfter">,
) => {
  const until = info.notAfter.slice(0, 10);
  return info.selfSigned
    ? `Made by Blank, valid until ${until}`
    : `${issuedBy(info).replace(/^i/, "I")}, valid until ${until}`;
};
