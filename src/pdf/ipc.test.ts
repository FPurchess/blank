import { describe, expect, it } from "vitest";

import { failedField, failureOf, readBitmap } from "./ipc";

describe("what the PDF tabs' native side sends", () => {
  it("tells its failures apart by kind, and names a refused fill's field", () => {
    expect(failureOf("changed")).toBe("changed");
    // pdf_set_fills fails with the field whose fill was refused
    const refused = { kind: "missingGlyphs", field: "form.name" };
    expect(failureOf(refused)).toBe("missingGlyphs");
    expect(failedField(refused)).toBe("form.name");
    expect(failedField({ kind: "crashed", field: null })).toBeNull();
    // anything else is the webview's own
    expect(failureOf(new Error("boom"))).toBe("engine");
    expect(failedField("badRequest")).toBeNull();
  });

  it("reads a page's pixels, with its size at the end", () => {
    const buffer = new ArrayBuffer(2 * 1 * 4 + 8);
    new Uint8Array(buffer).set([1, 2, 3, 4, 5, 6, 7, 8]);
    const sizes = new DataView(buffer, 8);
    sizes.setUint32(0, 2, true);
    sizes.setUint32(4, 1, true);
    const bitmap = readBitmap(buffer);
    expect(bitmap.width).toBe(2);
    expect(bitmap.height).toBe(1);
    expect([...bitmap.pixels]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
