import { describe, expect, it } from "vitest";

import {
  initialsOf,
  problemOf,
  sampleOf,
  startOf,
} from "./signatureDialogModel";

describe("the signature dialog", () => {
  it("starts on drawing, with the name or its initials to type", () => {
    expect(startOf("signature", null, "Ada Lovelace")).toMatchObject({
      tab: "draw",
      text: "Ada Lovelace",
      font: "Pinyon Script",
    });
    expect(startOf("initials", null, "Ada King Lovelace").text).toBe("AKL");
    expect(initialsOf("  zoë öztürk ")).toBe("ZÖ");
  });

  it("shows the fonts with what is to be typed", () => {
    expect(sampleOf("signature")).toBe("Your name");
    expect(sampleOf("initials")).toBe("Your initials");
  });

  it("opens a saved one as it was made", () => {
    const saved = {
      source: { kind: "type" as const, text: "Ada", font: "Caveat" as const },
      png: "",
      width: 1,
      height: 1,
    };
    expect(startOf("signature", saved, "")).toMatchObject({
      tab: "type",
      text: "Ada",
      font: "Caveat",
    });
  });

  it("says what's missing before it can save", () => {
    const empty = { strokes: [], text: " ", image: null };
    expect(problemOf("type", "initials", empty)).toBe(
      "Type your initials first.",
    );
    expect(problemOf("draw", "initials", empty)).toBe(
      "Draw your initials first.",
    );
    expect(problemOf("image", "signature", { ...empty, image: "data:" })).toBe(
      "",
    );
  });
});
