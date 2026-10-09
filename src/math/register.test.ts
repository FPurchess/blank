import { describe, expect, it } from "vitest";

import { loadTemml } from "./mathml";
import { flushPromises } from "../test/async";
import { mathPreview, renderMath } from "./register";

describe("a formula without the engine", () => {
  it("is fine when Temml reads it, and says why when not", async () => {
    await loadTemml();
    expect(renderMath("x^2", false).ok).toBe(true);
    const broken = renderMath("\\frac{a", true);
    expect(broken.ok).toBe(false);
    expect(broken.ok === false && broken.error).toBeTruthy();
  });
});

describe("the MathML of formulas", () => {
  it("fills in after Temml, fifty a task, and at once when met before", async () => {
    await loadTemml();
    const previews = Array.from({ length: 120 }, (_, index) =>
      mathPreview(`x_{${index}}`, false),
    );
    // the source until then
    expect(previews[0].textContent).toBe("x_{0}");
    await flushPromises();
    const filled = () =>
      previews.filter((preview) => preview.querySelector("math")).length;
    expect(filled()).toBe(50);
    await new Promise((done) => setTimeout(done));
    expect(filled()).toBe(100);
    await new Promise((done) => setTimeout(done));
    expect(filled()).toBe(120);
    // the same formula again: from what was made
    expect(mathPreview("x_{7}", false).querySelector("math")).not.toBeNull();
  });
});
