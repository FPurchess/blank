import { describe, expect, it } from "vitest";

import { type ExportSigning, exportRequest } from "./exportPlan";
import { initialsRect, isInitialsChoice } from "./initials";

const BOX = { page: 0, x: 70, y: 600, width: 230, height: 70 };
const A4 = { width: 595.28, height: 841.89 };

const signing = (changes: Partial<ExportSigning> = {}): ExportSigning => ({
  passphrase: null,
  place: "Berlin",
  reason: "",
  timestampServer: "https://tsa.example",
  signatureBox: BOX,
  others: [],
  initials: null,
  page: A4,
  ...changes,
});

describe("a signed export's update", () => {
  it("leaves a PDF without a digital signature, others or initials as it is", () => {
    expect(exportRequest(signing())).toBeNull();
  });

  it("signs over the block, with the time from the server", () => {
    const { request, initials } = exportRequest(
      signing({ passphrase: "secret", reason: "I agree" }),
    )!;
    expect(initials).toBe(false);
    expect(request).toEqual({
      passphrase: "secret",
      source: { kind: "body" },
      plan: {
        stamps: [],
        signature: { kind: "new", page: 1, rect: [70, 600, 230, 70] },
        others: [],
        location: "Berlin",
        reason: "I agree",
        timestampServer: "https://tsa.example",
      },
    });
  });

  it("never signs without the block's box", () => {
    expect(() =>
      exportRequest(signing({ passphrase: "secret", signatureBox: undefined })),
    ).toThrow("the signature block isn't in the PDF");
  });

  it("adds the others' fields and the initials without a signature", () => {
    const { request, initials } = exportRequest(
      signing({
        others: [
          { name: "Bea", box: { ...BOX, page: 2 } },
          { name: "Cy", box: null },
        ],
        initials: "right",
      }),
    )!;
    expect(initials).toBe(true);
    expect(request.passphrase).toBeNull();
    expect(request.plan.signature).toEqual({ kind: "invisible" });
    expect(request.plan.timestampServer).toBeNull();
    // one not on the pages gets none
    expect(request.plan.others).toEqual([
      { page: 3, rect: [70, 600, 230, 70], name: "Bea" },
    ]);
    expect(request.plan.stamps).toEqual([
      { part: 1, page: 1, rect: initialsRect(A4, "right"), repeat: true },
    ]);
  });
});

describe("the initials on every page", () => {
  it("go 36 pt from the bottom and the side chosen, 56 × 28 pt", () => {
    expect(initialsRect({ width: 600, height: 800 }, "right")).toEqual([
      508, 736, 56, 28,
    ]);
    expect(initialsRect({ width: 600, height: 800 }, "left")).toEqual([
      36, 736, 56, 28,
    ]);
  });

  it("are remembered only as the dialog chose them", () => {
    expect(isInitialsChoice({ on: true, side: "left" })).toBe(true);
    expect(isInitialsChoice({ on: "yes", side: "left" })).toBe(false);
    expect(isInitialsChoice({ on: true, side: "top" })).toBe(false);
    expect(isInitialsChoice(null)).toBe(false);
  });
});
