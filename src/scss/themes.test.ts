import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { themes } from "../state/appearance";
import { BLOCKS_DOCK, TILE_COLUMNS } from "../ui/blocksPaneModel";
import { OUTLINE_DOCK } from "../ui/outlineModel";
import {
  contrast,
  luminance,
  mix,
  parseColor,
  mixinValues,
  type Mode,
  scssNumber,
  themeColor,
  themeVariables,
} from "./contrast";

// the share of the desk's color in a tooltip's shortcut, over the ink
const TIP_KEY = scssNumber("_controls.scss", "tip-key") / 100;

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
  it.each(themes)("have a partial that the themes use: %s", (theme) => {
    const partials = resolve(import.meta.dirname, "themes");
    expect(existsSync(resolve(partials, `_${theme}.scss`))).toBe(true);
    expect(readFileSync(resolve(partials, "_index.scss"), "utf8")).toMatch(
      new RegExp(`^@use "${theme}";$`, "m"),
    );
  });

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

// The outline's and the blocks pane's colors are the controls' tokens
// (--muted, --muted-on-paper, --line-strong, --accent), which "the
// controls' colors" checks in every theme and color; only their room is
// theirs.
describe("the side panes", () => {
  it("takes the room the outline's model gives it", () => {
    // the open list's width and the gap to the text
    expect(
      scssNumber("main.scss", "outline-width") +
        scssNumber("main.scss", "outline-gap"),
    ).toBe(OUTLINE_DOCK);
  });

  it("gives the blocks pane the room and the rows its model gives it", () => {
    expect(scssNumber("main.scss", "blocks-dock")).toBe(BLOCKS_DOCK);
    expect(scssNumber("main.scss", "tile-columns")).toBe(TILE_COLUMNS);
  });
});

describe("the desk and the sheets", () => {
  it.each(themes)("shade the desk and cast black shadows in %s", (theme) => {
    const { variables, background, color } = colorsOf(theme);
    // a shade off the paper; in dark themes darker, not lighter
    expect(luminance(color("desk-color"))).toBeLessThan(luminance(background));
    for (const name of ["sheet-edge", "sheet-shadow", "popover-shadow"]) {
      const [r, g, b] = /rgba\((\d+), (\d+), (\d+),/
        .exec(variables[name])!
        .slice(1)
        .map(Number);
      expect([r, g, b]).toEqual([0, 0, 0]);
    }
  });
});

describe("the controls' colors", () => {
  const modes: Mode[] = ["accent", "mono"];
  const cases = themes.flatMap((theme) =>
    modes.map((mode) => [theme, mode] as const),
  );
  // the grounds controls stand on: the desk around the pages, and the paper
  // of the pages, menus and dialogs
  const grounds = (theme: string, mode: Mode) => {
    const color = themeColor(theme, mode);
    const desk = color("desk-color", [0, 0, 0]);
    const paper = color("background-color", [0, 0, 0]);
    return { color, desk, paper };
  };

  it.each(cases)(
    "read as text where they're secondary in %s, %s",
    (theme, mode) => {
      const { color, desk, paper } = grounds(theme, mode);
      expect(contrast(color("muted", desk), desk)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(color("muted-on-paper", paper), paper),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(cases)(
    "read as secondary text inside a popover in %s, %s",
    (theme, mode) => {
      // as the popover mixin re-points --muted for what's inside it
      const surface = mixinValues("_controls.scss", "popover");
      expect(surface.muted).toBe("var(--muted-on-paper)");
      const color = themeColor(theme, mode, surface);
      const paper = color("background-color", [0, 0, 0]);
      expect(contrast(color("muted", paper), paper)).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );

  it.each(cases)(
    "show the accent, the focus ring and borders in %s, %s",
    (theme, mode) => {
      const { color, desk, paper } = grounds(theme, mode);
      for (const ground of [desk, paper]) {
        expect(
          contrast(color("accent", ground), ground),
        ).toBeGreaterThanOrEqual(3);
        expect(contrast(color("focus", ground), ground)).toBeGreaterThanOrEqual(
          3,
        );
      }
      expect(contrast(color("line-strong", desk), desk)).toBeGreaterThanOrEqual(
        3,
      );
    },
  );

  it.each(cases)("write on the accent in %s, %s", (theme, mode) => {
    const { color, desk } = grounds(theme, mode);
    const accent = color("accent", desk);
    const hover = color("accent-hover", desk);
    expect(
      contrast(color("accent-ink", accent), accent),
    ).toBeGreaterThanOrEqual(4.5);
    // the primary button under the pointer: still legible, and visibly
    // different from at rest
    expect(contrast(color("accent-ink", hover), hover)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(hover, accent)).toBeGreaterThan(1.1);
  });

  it.each(cases)("show what's on in %s, %s", (theme, mode) => {
    const { color, desk, paper } = grounds(theme, mode);
    for (const ground of [desk, paper]) {
      // an icon button's fill and icon, and a status item's text
      const fill = color("on-fill", ground);
      expect(contrast(color("on-ink", fill), fill)).toBeGreaterThanOrEqual(3);
      expect(contrast(color("on-text", ground), ground)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it.each(cases)("write tooltips legibly in %s, %s", (theme, mode) => {
    const { color, desk } = grounds(theme, mode);
    // the desk's color on solid ink, and the shortcut in it a little fainter
    const ink = color("ink-fill", desk);
    expect(contrast(desk, ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(mix(desk, ink, TIP_KEY), ink)).toBeGreaterThanOrEqual(4.5);
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
