import { describe, expect, it } from "vitest";

import {
  certificateSummary,
  dateFormatOptions,
  groupFingerprint,
  parseTimestampServer,
} from "./signingModel";

describe("Settings ▸ Signing", () => {
  it("shows the date formats as they write a date", () => {
    expect(dateFormatOptions("en-GB").map((option) => option.label)).toEqual([
      "8 October 2026",
      "08/10/2026",
      "2026-10-08",
    ]);
  });

  it("takes a timestamp server's web address, or none", () => {
    expect(parseTimestampServer(" http://timestamp.digicert.com ")).toEqual({
      url: "http://timestamp.digicert.com",
    });
    expect(parseTimestampServer("")).toEqual({ url: "" });
    expect(parseTimestampServer("ftp://example.org")).toHaveProperty("error");
    expect(parseTimestampServer("timestamp")).toHaveProperty("error");
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
