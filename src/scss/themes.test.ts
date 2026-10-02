import { describe, expect, it } from "vitest";

import { themes } from "../state/appearance";
import { OUTLINE_DOCK } from "../ui/outlineModel";
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
    const selectedText = color("selection-text-color");
    const dimmed = color("selection-inactive-color");
    // the selection stands out from the page, and the selected text, in a
    // colour of its own over it, reads as well as body text should
    expect(contrast(selected, background)).toBeGreaterThanOrEqual(3);
    expect(contrast(selectedText, selected)).toBeGreaterThanOrEqual(4.5);
    // dimmed, it's still clearly there under the text in its usual colour,
    // and fainter
    expect(contrast(dimmed, background)).toBeGreaterThanOrEqual(1.8);
    expect(contrast(dimmed, background)).toBeLessThan(
      contrast(selected, background),
    );
    expect(contrast(text, dimmed)).toBeGreaterThanOrEqual(3);
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

describe("the outline", () => {
  const opacity = scssNumber("main.scss", "faint-text-opacity");
  const shade = scssNumber("main.scss", "outline-shade") / 100;
  // the list's panel: the desk with a little black
  const panelOf = (theme: string) =>
    mix([0, 0, 0], colorsOf(theme).color("desk-color"), shade);

  it.each(themes)("reads at 3:1 at least on its panel in %s", (theme) => {
    const { text } = colorsOf(theme);
    const panel = panelOf(theme);
    // its headings at the faint text's opacity while the pointer is over it
    expect(contrast(mix(text, panel, opacity), panel)).toBeGreaterThanOrEqual(
      3,
    );
  });

  it.each(themes)("stands out from the page in %s", (theme) => {
    const { background, color } = colorsOf(theme);
    const panel = panelOf(theme);
    expect(luminance(panel)).toBeLessThan(luminance(background));
    // and from the desk, but in Black, whose desk is black already, so the
    // panel is as black as it, beside the sheets in Pages
    expect(luminance(panel)).toBeLessThanOrEqual(
      luminance(color("desk-color")),
    );
  });

  it("takes the room the outline's model gives it", () => {
    // the open list's width and the gap to the text
    expect(
      scssNumber("main.scss", "outline-width") +
        scssNumber("main.scss", "outline-gap"),
    ).toBe(OUTLINE_DOCK);
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
    // space separated, which these themes don't write
    expect(() => parseColor("rgb(27 40 50)")).toThrow();
  });
});
