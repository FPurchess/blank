import { describe, expect, it } from "vitest";

import { schema } from "../markdown";
import { doc, p } from "../test/editor";
import { chosenOf, targetsOf } from "./targets";

const block = (attrs: Record<string, string> = {}) =>
  schema.node("signature", attrs);

describe("the signature blocks a document can be signed in", () => {
  const contract = doc(
    p("Both sign."),
    block({ role: "Landlord", name: "Bob Builder" }),
    block({ role: "Tenant" }),
    block({ name: "Ada Lovelace" }),
  );

  it("are named by who signs on them and as what", () => {
    expect(targetsOf(contract).map((target) => target.label)).toEqual([
      "Bob Builder · Landlord",
      "Tenant",
      "Ada Lovelace",
    ]);
    expect(targetsOf(doc(block())).map((target) => target.label)).toEqual([
      "Signature 1",
    ]);
  });

  it("choose the block with the user's name, else one that names nobody", () => {
    const targets = targetsOf(contract);
    expect(chosenOf(targets, "Ada Lovelace")).toBe(targets[2].pos);
    expect(chosenOf(targets, "Someone Else")).toBe(targets[1].pos);
    expect(chosenOf(targets.slice(0, 1), "")).toBe(targets[0].pos);
  });
});
