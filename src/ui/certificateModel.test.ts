import { describe, expect, it } from "vitest";

import {
  certificateLine,
  certificateSummary,
  groupFingerprint,
  validity,
} from "./certificateModel";

const certificate = {
  name: "Maria Keller",
  issuer: "Maria Keller",
  notBefore: "2026-10-01T00:00:00Z",
  notAfter: "2031-10-01T00:00:00Z",
  selfSigned: true,
  fingerprint: "AB".repeat(32),
};

describe("how a certificate is written", () => {
  it("describes the certificate", () => {
    expect(certificateLine(certificate)).toBe("Maria Keller · self-signed");
    expect(
      certificateLine({
        ...certificate,
        selfSigned: false,
        issuer: "DigiCert",
      }),
    ).toBe("Maria Keller · issued by DigiCert");
    expect(validity(certificate, "en-GB")).toBe("Oct 2026 – Oct 2031");
  });

  it("writes a fingerprint in groups of four, and says whose a certificate is", () => {
    expect(groupFingerprint("ABCDEF0123")).toBe("ABCD EF01 23");
    expect(
      certificateSummary({
        selfSigned: true,
        issuer: "Ada",
        notAfter: "2031-10-08T10:00:00Z",
      }),
    ).toBe("Made by Blank, valid until 2031-10-08");
    expect(
      certificateSummary({
        selfSigned: false,
        issuer: "D-Trust",
        notAfter: "2028-01-01",
      }),
    ).toBe("Issued by D-Trust, valid until 2028-01-01");
  });
});
