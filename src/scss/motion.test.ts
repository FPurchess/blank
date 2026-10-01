import { compileAsync } from "sass-embedded";
import { describe, expect, it } from "vitest";

// What moves on its own, the blinking caret and the strips that fade in,
// keeps still when the system asks for less motion: every rule that
// animates or has a transition has its counterpart in the reduced-motion
// block, so a new one can't slip by.

// the rules of compressed CSS, as their selectors and declarations
const rulesOf = (css: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: selectors.split(",").map((selector) => selector.trim()),
    body,
  }));

describe("reduced motion", () => {
  it("stills every animation and transition", async () => {
    const { css } = await compileAsync("src/scss/main.scss", {
      loadPaths: ["src/scss"],
      style: "compressed",
    });
    const block =
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{(.*?\})\}/s.exec(css);
    expect(block).not.toBeNull();
    const reduced = rulesOf(block![1]);
    // the rest, without the keyframes, whose steps don't move by themselves
    const rest = css
      .replace(block![0], "")
      .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    const moving = rulesOf(rest).flatMap(({ selectors, body }) =>
      (["animation", "transition"] as const)
        .filter(
          (property) =>
            new RegExp(`(^|;)${property}(-name)?:`).test(body) &&
            !new RegExp(`${property}:none`).test(body),
        )
        .flatMap((property) =>
          selectors.map((selector) => ({ selector, property })),
        ),
    );
    // the caret's blink, the strips' fades, the faded pages, at least
    expect(moving.length).toBeGreaterThanOrEqual(5);
    for (const { selector, property } of moving) {
      const stilled = reduced.some(
        (rule) =>
          rule.selectors.includes(selector) &&
          rule.body.includes(`${property}:none`),
      );
      expect([selector, property, stilled]).toEqual([selector, property, true]);
    }
  });
});
