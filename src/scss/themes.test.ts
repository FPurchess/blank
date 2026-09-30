import { describe, expect, it } from "vitest";

import { themes } from "../state/appearance";
import {
  contrast,
  luminance,
  mix,
  parseColor,
  scssNumber,
  themeVariables,
} from "./contrast";

// what each theme shows the page view in, as the theme files set it
const colorsOf = (theme: string) => {
  const variables = themeVariables(theme);
  const background = parseColor(variables["background-color"]);
  return {
    variables,
    background,
    text: parseColor(variables.color, background),
    color: (name: string) => parseColor(variables[name], background),
  };
};

describe("the themes", () => {
  it.each(themes)("show the selection on the pages in %s", (theme) => {
    const { background, text, color } = colorsOf(theme);
    const selected = color("selection-color");
    const dimmed = color("selection-inactive-color");
    // the selection stands out from the page
    expect(contrast(selected, background)).toBeGreaterThanOrEqual(3);
    // and its text, painted over it, stays readable: a colour between the
    // text's and the page's leaves the text what is left of their contrast,
    // e.g. about 6.4 / 3 in the green theme
    expect(contrast(text, selected)).toBeGreaterThanOrEqual(2);
    // dimmed, it's still clearly there, and fainter
    expect(contrast(dimmed, background)).toBeGreaterThanOrEqual(1.8);
    expect(contrast(dimmed, background)).toBeLessThan(
      contrast(selected, background),
    );
  });
});

describe("the faint text beside the pages", () => {
  const opacity = scssNumber("main.scss", "faint-text-opacity");

  it.each(themes)("reads at 3:1 at least in %s", (theme) => {
    const { background, text } = colorsOf(theme);
    // the bands where a page ends and at rest, its number, and the label of
    // a page break, all at the same opacity
    expect(
      contrast(mix(text, background, opacity), background),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("the desk and the sheets", () => {
  it.each(themes)("shade the desk and cast black shadows in %s", (theme) => {
    const { variables, background, color } = colorsOf(theme);
    // a shade off the paper; in dark themes darker, not lighter
    expect(luminance(color("desk-color"))).toBeLessThan(luminance(background));
    for (const name of ["sheet-edge", "sheet-shadow"]) {
      const [r, g, b] = /rgba\((\d+), (\d+), (\d+),/
        .exec(variables[name])!
        .slice(1)
        .map(Number);
      expect([r, g, b]).toEqual([0, 0, 0]);
    }
  });
});

describe("parseColor", () => {
  it("reads hex, rgb and rgba over a background", () => {
    expect(parseColor("#fff")).toEqual([1, 1, 1]);
    expect(parseColor("#000000")).toEqual([0, 0, 0]);
    expect(parseColor("rgb(255, 0, 0)")).toEqual([1, 0, 0]);
    expect(parseColor("rgba(255, 255, 255, 0.5)", [0, 0, 0])).toEqual([
      0.5, 0.5, 0.5,
    ]);
    expect(() => parseColor("red")).toThrow();
  });
});
