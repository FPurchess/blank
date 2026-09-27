import { describe, expect, it } from "vitest";

import { testLayout } from "../test/layout";
import { thumbnailSvg } from "./thumbnail";

const parse = (svg: string) =>
  new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;

describe("thumbnailSvg", () => {
  it("draws the paper in its proportions", () => {
    const portrait = parse(thumbnailSvg(testLayout()));
    const landscape = parse(
      thumbnailSvg(testLayout({ orientation: "landscape" })),
    );

    expect(portrait.getAttribute("viewBox")).toBe("0 0 93.3 132");
    expect(landscape.getAttribute("viewBox")).toBe("0 0 132 93.3");
  });

  it("frames the margins and fills them with lines of text", () => {
    const svg = parse(
      thumbnailSvg(
        testLayout({ margins: { top: 100, right: 50, bottom: 100, left: 50 } }),
      ),
    );

    const frame = svg.querySelector(".margins");
    const scale = 132 / 841.89;
    expect(Number(frame?.getAttribute("x"))).toBeCloseTo(50 * scale, 1);
    expect(Number(frame?.getAttribute("y"))).toBeCloseTo(100 * scale, 1);
    const lines = [...svg.querySelectorAll(".text line")];
    expect(lines.length).toBeGreaterThan(5);
    const bottom = Math.max(
      ...lines.map((line) => Number(line.getAttribute("y1"))),
    );
    expect(bottom).toBeLessThan((841.89 - 100) * scale);
  });
});
