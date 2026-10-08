import { describe, expect, it } from "vitest";

import {
  initialsOf,
  problemOf,
  startOf,
  titleOf,
} from "./signatureDialogModel";

describe("the signature dialog", () => {
  it("is titled by what it makes", () => {
    expect(titleOf("signature")).toBe("Your signature");
    expect(titleOf("initials")).toBe("Your initials");
  });

  it("starts on drawing, with the name or its initials to type", () => {
    expect(startOf("signature", null, "Ada Lovelace")).toMatchObject({
      tab: "draw",
      text: "Ada Lovelace",
      font: "Pinyon Script",
    });
    expect(startOf("initials", null, "Ada King Lovelace").text).toBe("AKL");
    expect(initialsOf("  zoë öztürk ")).toBe("ZÖ");
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
    expect(problemOf("draw", { strokes: [], text: "", image: null })).toBe(
      "Draw your signature first.",
    );
    expect(problemOf("type", { strokes: [], text: " ", image: null })).toBe(
      "Type your name first.",
    );
    expect(problemOf("image", { strokes: [], text: "", image: "data:" })).toBe(
      "",
    );
  });
});
