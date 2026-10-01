import { compileAsync } from "sass-embedded";
import { describe, expect, it } from "vitest";

// What moves on its own, the blinking caret and the strips that fade in,
// keeps still when the system asks for less motion.

describe("reduced motion", () => {
  it("stops the caret and the fades", async () => {
    const { css } = await compileAsync("src/scss/main.scss", {
      loadPaths: ["src/scss"],
      style: "compressed",
    });
    const block =
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{(.*?\})\}/s.exec(css);
    expect(block).not.toBeNull();
    const rules = block![1];
    expect(rules).toMatch(/\.page-caret[^{]*\{animation:none\}/);
    expect(rules).toMatch(/\.band-editor[^{]*\{animation:none\}/);
    expect(rules).toMatch(/#page-view\{transition:none\}/);
  });
});
