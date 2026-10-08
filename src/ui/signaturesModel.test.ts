import { describe, expect, it } from "vitest";

import type { CheckedSignature } from "../signing/ipc";
import {
  canTrust,
  certificateLine,
  signatureStatus,
  signaturesLabel,
  signedWhen,
  validity,
} from "./signaturesModel";

const certificate = {
  name: "Maria Keller",
  issuer: "Maria Keller",
  notBefore: "2026-10-01T00:00:00Z",
  notAfter: "2031-10-01T00:00:00Z",
  selfSigned: true,
  fingerprint: "AB".repeat(32),
};

const signature = (
  change: Partial<CheckedSignature> = {},
): CheckedSignature => ({
  field: "Signature1",
  name: "Maria Keller",
  time: "2026-10-07T18:40:00Z",
  timestamped: false,
  reason: null,
  location: null,
  status: "valid",
  trust: { kind: "unknown" },
  certificate,
  certificateDer: "3082",
  ...change,
});

describe("what Blank says of a PDF's signatures", () => {
  it("sums them up in the status bar", () => {
    expect(signaturesLabel(null)).toBeNull();
    expect(signaturesLabel([])).toMatchObject({ text: "Not signed", icon: "" });
    expect(signaturesLabel([signature({ trust: { kind: "own" } })])).toEqual({
      text: "Signed",
      icon: "seal",
      look: "ok",
    });
    const trusted = signature({ trust: { kind: "trusted" } });
    expect(signaturesLabel([trusted, trusted])?.text).toBe("Signed by 2");
    expect(signaturesLabel([trusted, signature()])?.text).toBe(
      "Signed, signer unknown",
    );
    expect(
      signaturesLabel([trusted, signature({ status: "changedAfterSigning" })]),
    ).toMatchObject({ text: "Changed after signing", icon: "seal-off" });
    expect(
      signaturesLabel([
        signature({ status: "changedAfterSigning" }),
        signature({ status: "invalid" }),
      ])?.text,
    ).toBe("Signature invalid");
    expect(signaturesLabel("failed")?.look).toBe("bad");
  });

  it("calls a signature of a certificate Blank doesn't trust only intact", () => {
    expect(signatureStatus(signature({ trust: { kind: "own" } }))).toBe(
      "Valid · your certificate",
    );
    expect(
      signatureStatus(
        signature({ trust: { kind: "issuedBy", issuer: "DigiCert" } }),
      ),
    ).toBe("Intact · issued by DigiCert");
    expect(signatureStatus(signature())).toBe("Intact · signer unknown");
    expect(signatureStatus(signature({ status: "invalid" }))).toMatch(
      /doesn't match the PDF/,
    );
  });

  it("says when and by whose clock", () => {
    expect(signedWhen(signature(), "en-GB")).toMatch(
      /^7 Oct 2026, .* · computer clock$/,
    );
    expect(signedWhen(signature({ time: null, timestamped: true }))).toBe(
      "timestamped",
    );
  });

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

  it("offers to trust only an intact signature of an unknown certificate", () => {
    expect(canTrust(signature())).toBe(true);
    expect(canTrust(signature({ trust: { kind: "trusted" } }))).toBe(false);
    expect(canTrust(signature({ status: "invalid" }))).toBe(false);
  });
});
