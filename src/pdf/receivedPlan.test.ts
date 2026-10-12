import { describe, expect, it } from "vitest";

import { receivedPlan } from "./receivedPlan";
import { type Stamp, stampSpec } from "./stampModel";

// What signing a received PDF asks the signer for: the stamps as parts of
// the body, and where the signature goes.

const stamp = (over: Partial<Stamp> = {}): Stamp => ({
  id: "s",
  kind: "signature",
  page: 0,
  rect: [100, 300, 180, 60],
  natural: [180, 60],
  spec: stampSpec("signature"),
  ...over,
});

const signing = {
  digital: true,
  name: "Ada Lovelace",
  place: "Berlin",
  reason: "",
  timestampServer: "https://tsa.example",
};

describe("signing a PDF received", () => {
  it("shows the signature in the signature field it fills", () => {
    const date = stamp({ id: "d", kind: "date", rect: [100, 380, 80, 14] });
    const signature = stamp({ place: "field:form.signature" });
    const { plan, parts } = receivedPlan({
      ...signing,
      stamps: [date, signature],
    });
    expect(parts).toEqual([signature, date]);
    expect(plan.signature).toEqual({
      kind: "existing",
      field: "form.signature",
      stamp: 0,
    });
    expect(plan.stamps).toEqual([
      { part: 1, page: 1, rect: [100, 380, 80, 14], repeat: false },
    ]);
    expect(plan.name).toBe("Ada Lovelace");
    expect(plan.location).toBe("Berlin");
    expect(plan.reason).toBeNull();
    expect(plan.timestampServer).toBe("https://tsa.example");
    expect(plan.others).toEqual([]);
  });

  it("puts a signature on a found line in a new field there", () => {
    const signature = stamp({ page: 1, place: "found:1:100:316" });
    const { plan } = receivedPlan({ ...signing, stamps: [signature] });
    expect(plan.signature).toEqual({
      kind: "new",
      page: 2,
      rect: [100, 300, 180, 60],
      stamp: 0,
    });
    expect(plan.stamps).toEqual([]);
  });

  it("prefers the signature on a field when there are several", () => {
    const free = stamp({ id: "free", rect: [10, 10, 180, 60] });
    const onField = stamp({ id: "on", place: "field:sig" });
    const { plan, parts } = receivedPlan({
      ...signing,
      stamps: [free, onField],
    });
    expect(plan.signature).toMatchObject({ kind: "existing", field: "sig" });
    expect(plan.stamps).toEqual([
      { part: parts.indexOf(free), page: 1, rect: free.rect, repeat: false },
    ]);
  });

  it("draws every stamp into the pages without a digital signature", () => {
    const initials = stamp({
      id: "i",
      kind: "initials",
      rect: [500, 780, 56, 28],
      repeat: true,
    });
    const signature = stamp({ place: "field:sig" });
    const { plan, parts } = receivedPlan({
      ...signing,
      digital: false,
      stamps: [initials, signature],
    });
    expect(plan.signature).toEqual({ kind: "invisible" });
    expect(plan.stamps).toEqual([
      { part: 0, page: 1, rect: signature.rect, repeat: false },
      { part: 1, page: 1, rect: initials.rect, repeat: true },
    ]);
    expect(parts).toEqual([signature, initials]);
    expect(plan.timestampServer).toBeNull();
  });

  it("signs invisibly without a signature on the pages", () => {
    const { plan, parts } = receivedPlan({ ...signing, stamps: [] });
    expect(plan.signature).toEqual({ kind: "invisible" });
    expect(parts).toEqual([]);
  });
});
