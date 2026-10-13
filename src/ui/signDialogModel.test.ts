import { describe, expect, it } from "vitest";

import {
  dateNote,
  namedNote,
  othersNote,
  placeNote,
  timeNote,
} from "./signDialogModel";

const target = (changes = {}) => ({
  pos: 1,
  name: "",
  place: "",
  dated: true,
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
    expect(othersNote([target(), target({ pos: 5 })])).toContain("stay empty");
  });
});
