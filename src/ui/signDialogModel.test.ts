import { describe, expect, it } from "vitest";

import {
  canSign,
  dateNote,
  emptyFieldsNote,
  initialsProblem,
  namedNote,
  NO_INITIALS,
  othersNote,
  placeNote,
  signAsItems,
  signAsText,
  stampNote,
  timeNote,
} from "./signDialogModel";

const target = (changes = {}) => ({
  pos: 1,
  name: "",
  place: "",
  dated: true,
  role: "Tenant",
  label: "Tenant",
  ...changes,
});

describe("the dialog that signs", () => {
  it("names the timestamp server by its host", () => {
    expect(timeNote("https://timestamp.digicert.com/tsa")).toBe(
      "The time of signing comes from the timestamp server timestamp.digicert.com.",
    );
    expect(timeNote("")).toContain("your computer's clock");
  });

  it("warns of a block for someone else, and says what a block fixes", () => {
    expect(namedNote(target({ name: "Bea" }), "Ada")).toContain(
      "This block is for Bea",
    );
    expect(namedNote(target({ name: "Ada" }), "Ada")).toBe("");
    expect(namedNote(target(), "Ada")).toBe("");
    expect(placeNote(target({ place: "Paris" }))).toContain("Paris");
    expect(placeNote(target())).toBe("");
  });

  it("says which date goes under it, and that the others stay empty", () => {
    const today = { date: "10 October 2026", language: "English" };
    expect(dateNote(target(), today)).toContain(
      "Dated 10 October 2026, written in English",
    );
    expect(dateNote(target({ dated: false }), today)).toBe("");
    expect(othersNote([target()])).toBe("");
    expect(othersNote([target(), target({ pos: 5 })])).toContain(
      "empty signature fields",
    );
  });

  it("signs as the certificate, or offers to make one", () => {
    const labels = (certificate: string | null) =>
      signAsItems({
        certificate,
        how: "digital",
        choose: () => {},
        create: () => {},
        manage: () => {},
      }).map((item) => (item === "separator" ? "—" : item.label));
    expect(labels("Ada")).toEqual([
      "Ada · your certificate",
      "No digital signature (only the visible signature)",
      "—",
      "Manage…",
    ]);
    expect(labels(null)).toEqual([
      "No digital signature (only the visible signature)",
      "—",
      "Create your certificate…",
      "Manage…",
    ]);
    expect(signAsText("digital", "Ada")).toBe("Ada · your certificate");
    expect(signAsText("digital", null)).toContain("No digital signature");
    expect(signAsText("visible", "Ada")).toContain("No digital signature");
  });

  it("says why the initials can't go on the pages", () => {
    expect(initialsProblem(undefined, true)).toBe("");
    expect(initialsProblem(undefined, false)).toBe(NO_INITIALS);
    expect(initialsProblem("Signed.", false)).toBe("Signed.");
  });

  it("says what a PDF tab without the signature on a page gets", () => {
    expect(stampNote(true, false)).toBe("");
    expect(stampNote(false, true)).toContain("invisible");
    expect(stampNote(false, false)).toContain("Place your signature");
    expect(emptyFieldsNote(0)).toBe("");
    expect(emptyFieldsNote(1)).toBe("This PDF still has 1 place to fill in.");
    expect(emptyFieldsNote(2)).toBe("This PDF still has 2 places to fill in.");
  });

  it("signs with a signature on the page or digitally, once the pages are checked", () => {
    const base = {
      stamped: true,
      digital: false,
      confirmPages: false,
      checked: false,
    };
    expect(canSign(base)).toBe(true);
    expect(canSign({ ...base, stamped: false })).toBe(false);
    expect(canSign({ ...base, stamped: false, digital: true })).toBe(true);
    expect(canSign({ ...base, confirmPages: true })).toBe(false);
    expect(canSign({ ...base, confirmPages: true, checked: true })).toBe(true);
  });

  it("signs a PDF others signed only digitally", () => {
    const why = "Sign with your certificate.";
    const [, visible] = signAsItems({
      certificate: "Ada",
      how: "digital",
      visibleRefusal: why,
      choose: () => {},
      create: () => {},
      manage: () => {},
    });
    expect(visible).toMatchObject({ id: "visible", disabled: true, tip: why });
    const base = { stamped: true, confirmPages: false, checked: false };
    expect(canSign({ ...base, digital: false, visibleRefused: true })).toBe(
      false,
    );
    expect(canSign({ ...base, digital: true, visibleRefused: true })).toBe(
      true,
    );
  });
});
