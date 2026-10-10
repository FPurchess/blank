import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { sanitizeSvg } from "../markdown/blocks/svg";
import { authorColors, parseColor, recolor, strength } from "./recolor";

// diagrams Mermaid 12 drew in Blank's palette (see ./mermaid.ts), in
// headless Chrome
const fixture = (name: string) =>
  readFileSync(
    resolve(import.meta.dirname, "__fixtures__", `${name}.svg`),
    "utf8",
  );

const FLOW_SOURCE = [
  "flowchart LR",
  "  A[Idea] --> B{Choice}",
  "  style C fill:#f9c,stroke:#333",
  "  classDef hot fill:#fd0",
].join("\n");

// the colours left in what an SVG paints, but the ink; CSS that SVG
// doesn't draw (background-color, box-shadow) can keep its own
const colorsIn = (svg: string) =>
  [
    ...svg.matchAll(
      /(?<![-\w])(?:fill|stroke|stop-color|color)\s*[:=]\s*"?(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/gi,
    ),
  ].map((match) => match[1]);

describe("recolouring a diagram in ink", () => {
  it("reads CSS colours", () => {
    expect(parseColor("#f9c")).toEqual({ r: 255, g: 153, b: 204, a: 1 });
    expect(parseColor("#00000080")).toMatchObject({ r: 0, a: 128 / 255 });
    expect(parseColor("rgb(255, 221, 0)")).toEqual({
      r: 255,
      g: 221,
      b: 0,
      a: 1,
    });
    expect(parseColor("rgba(0,0,0,0.2)")).toMatchObject({ a: 0.2 });
    expect(parseColor("rgb(0 0 0 / 0.4)")).toMatchObject({ a: 0.4 });
    expect(parseColor("hsl(120, 100%, 25%)")).toMatchObject({
      r: 0,
      g: 128,
      b: 0,
    });
    expect(parseColor("White")).toMatchObject({ r: 255, g: 255, b: 255 });
    expect(parseColor("none")).toBeNull();
  });

  it("draws dark colours strong and pale ones faint", () => {
    expect(strength(parseColor("#000")!)).toBe(1);
    expect(strength(parseColor("#fff")!)).toBe(0);
    expect(strength(parseColor("#e8e8e8")!)).toBeLessThan(0.15);
    expect(strength(parseColor("rgba(0,0,0,0.2)")!)).toBe(0.2);
  });

  it("finds the author's colours in the source", () => {
    expect(authorColors(FLOW_SOURCE)).toEqual(
      new Set(["255,153,204,100", "51,51,51,100", "255,221,0,100"]),
    );
    expect(authorColors("flowchart LR\n  red --> blue")).toEqual(new Set());
  });

  it("leaves only the author's colours, in a drawing it can still clean", () => {
    const svg = recolor(fixture("flowchart"), FLOW_SOURCE);
    const left = new Set(colorsIn(svg).map((color) => color.toLowerCase()));
    // as Mermaid wrote them: the style's, the class's (also as rgb), and
    // #333, which the author used too
    for (const color of left) {
      expect(["#f9c", "#fd0", "rgb(255, 221, 0)", "#333"]).toContain(color);
    }
    expect(left).toContain("#f9c");
    expect(svg).toMatch(/fill:ink\(0\.\d+\)/);
    expect(svg).toMatch(/fill="ink\(\d(?:\.\d+)?\)"|fill:ink\(1\)/);
    expect(sanitizeSvg(svg)).not.toBeNull();
  });

  it.each(["sequence", "gantt", "pie"])(
    "draws a %s without a colour of Mermaid's",
    (name) => {
      const svg = recolor(fixture(name), "");
      expect(colorsIn(svg)).toEqual([]);
      expect(sanitizeSvg(svg)).not.toBeNull();
    },
  );

  it("leaves the text of labels alone", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:#333}</style><text fill="#101010">color: red; fill:#000 ink(1)</text></svg>';
    const recolored = recolor(svg, "");
    expect(recolored).toContain(".a{fill:ink(0.8)}");
    expect(recolored).toContain('fill="ink(0.94)"');
    expect(recolored).toContain(">color: red; fill:#000 ink(1)</text>");
  });
});
