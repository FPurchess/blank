import { describe, expect, it } from "vitest";

import type { CheckedSignature } from "../signing/ipc";
import {
  canTrust,
  lookOf,
  signatureStatus,
  signatureVerdict,
  signaturesLabel,
  signedWhen,
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
  timestampAuthority: null,
  timestampTrusted: false,
  weak: null,
  laterSigner: null,
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
    expect(signaturesLabel("failed")).toMatchObject({
      text: "Signatures not checked",
      look: "bad",
    });
    expect(signaturesLabel("changed")?.text).toBe(
      "Signatures not checked: the file changed",
    );
    expect(signaturesLabel("missing")?.text).toBe(
      "Signatures not checked: the file is gone",
    );
  });

  it("calls a signature of a certificate Blank doesn't trust only intact", () => {
    expect(signatureStatus(signature({ trust: { kind: "own" } }))).toBe(
      "Valid · your certificate",
    );
    expect(
      signatureStatus(
        signature({ trust: { kind: "issuedBy", issuer: "DigiCert" } }),
      ),
    ).toBe("Intact · says it's issued by DigiCert");
    expect(signatureStatus(signature())).toBe("Intact · signer unknown");
    expect(signatureStatus(signature({ status: "invalid" }))).toMatch(
      /doesn't match the PDF/,
    );
  });

  it("says when and by whose clock, a timestamp not checked unless trusted", () => {
    expect(signedWhen(signature(), "en-GB")).toMatch(
      /^7 Oct 2026, .* · computer clock$/,
    );
    const stamped = signature({
      time: null,
      timestamped: true,
      timestampAuthority: "DigiCert Timestamp 2025",
    });
    expect(signedWhen(stamped)).toBe(
      "timestamped by DigiCert Timestamp 2025 (not checked)",
    );
    expect(signedWhen({ ...stamped, timestampTrusted: true })).toBe(
      "timestamped by DigiCert Timestamp 2025",
    );
    expect(signedWhen({ ...stamped, timestampAuthority: null })).toBe(
      "timestamped by an unknown server (not checked)",
    );
  });

  it("never calls a signature signed again later unchanged", () => {
    const earlier = signature({
      status: "signedAgainLater",
      trust: { kind: "own" },
      laterSigner: "Jonas Weber",
    });
    expect(lookOf(earlier)).toBe("unknown");
    expect(signaturesLabel([earlier, signature()])).toMatchObject({
      text: "Changed and signed again",
      look: "unknown",
    });
    expect(signatureStatus(earlier)).toBe(
      "Valid for the version it signed; changed and signed again later by Jonas Weber",
    );
    expect(signatureVerdict(earlier)).toBe(
      "Valid for the version it signed; changed and signed again later by Jonas Weber. The certificate is one Blank trusts.",
    );
    expect(signatureVerdict(earlier)).not.toMatch(/hasn't changed/);
    expect(
      signatureStatus({
        ...earlier,
        trust: { kind: "unknown" },
        laterSigner: null,
      }),
    ).toBe(
      "Intact for the version it signed; changed and signed again later by someone else",
    );
  });

  it("keeps a signature valid that later signatures only signed again", () => {
    const earlier = signature({
      trust: { kind: "own" },
      laterSigner: "Jonas Weber",
    });
    const later = signature({ trust: { kind: "trusted" } });
    expect(lookOf(earlier)).toBe("ok");
    expect(signaturesLabel([earlier, later])).toMatchObject({
      text: "Signed by 2",
      look: "ok",
    });
    expect(signatureStatus(earlier)).toBe("Valid · your certificate");
    expect(signatureVerdict(earlier)).toBe(
      "The PDF hasn't changed since it was signed, only signed again by Jonas Weber. The certificate is one Blank trusts.",
    );
  });

  it("flags a signature over SHA-1 as weak, not valid", () => {
    const weak = signature({ trust: { kind: "trusted" }, weak: "SHA-1" });
    expect(lookOf(weak)).toBe("unknown");
    expect(signaturesLabel([weak])).toMatchObject({
      text: "Weak signature",
      look: "unknown",
    });
    expect(signatureStatus(weak)).toBe("Weak: SHA-1 can be forged");
    expect(signatureVerdict(weak)).toMatch(
      /relies on SHA-1, whose signatures can be forged/,
    );
    expect(signatureVerdict(signature())).toBe(
      "The PDF hasn't changed since it was signed. Blank doesn't know this certificate.",
    );
  });

  it("offers to trust only an intact signature of an unknown certificate", () => {
    expect(canTrust(signature())).toBe(true);
    expect(canTrust(signature({ trust: { kind: "trusted" } }))).toBe(false);
    expect(canTrust(signature({ status: "invalid" }))).toBe(false);
  });
});
