import { describe, expect, it } from "vitest";

import { testLayout } from "../test/layout";
import { NO_SLOTS } from "./settings";
import { thumbnailSvg } from "./thumbnail";

const parse = (svg: string) =>
  new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;

const size = (svg: Element) =>
  (svg.getAttribute("viewBox") ?? "").split(" ").slice(2).map(Number);

const bandText = (svg: Element) =>
  [...svg.querySelectorAll(".band text")].map((text) => [
    text.textContent,
    text.getAttribute("text-anchor"),
  ]);

describe("thumbnailSvg", () => {
  it("draws the paper in its proportions", () => {
    const [w, h] = size(parse(thumbnailSvg(testLayout())));
    const [lw, lh] = size(
      parse(thumbnailSvg(testLayout({ orientation: "landscape" }))),
    );

    // A4, whose sides are 1 : √2
    expect(h / w).toBeCloseTo(Math.SQRT2, 1);
    expect([lw, lh]).toEqual([h, w]);
  });

  it("frames the margins and fills them with lines of text", () => {
    const svg = parse(
      thumbnailSvg(
        testLayout({ margins: { top: 100, right: 50, bottom: 100, left: 50 } }),
      ),
    );
    const [, h] = size(svg);
    const scale = h / 841.89;

    const frame = svg.querySelector(".margins");
    expect(Number(frame?.getAttribute("x"))).toBeCloseTo(50 * scale, 1);
    expect(Number(frame?.getAttribute("y"))).toBeCloseTo(100 * scale, 1);
    const lines = [...svg.querySelectorAll(".text line")];
    expect(lines.length).toBeGreaterThan(5);
    const bottom = Math.max(
      ...lines.map((line) => Number(line.getAttribute("y1"))),
    );
    expect(bottom).toBeLessThan((841.89 - 100) * scale);
  });

  it("writes the header and footer as they read on the page", () => {
    const layout = testLayout({
      header: { ...NO_SLOTS, left: "{title} <draft>" },
      footer: { ...NO_SLOTS, right: "Page {page} of {pages}" },
      startNumber: 3,
    });

    expect(bandText(parse(thumbnailSvg(layout, 2)))).toEqual([
      ["Title <draft>", "start"],
      ["Page 4 of 12", "end"],
    ]);
  });

  it("leaves a plain first page without them", () => {
    const layout = testLayout({
      footer: { ...NO_SLOTS, center: "{page}" },
      firstPage: "plain",
    });

    expect(bandText(parse(thumbnailSvg(layout, 1)))).toEqual([]);
    expect(bandText(parse(thumbnailSvg(layout, 2)))).toEqual([["2", "middle"]]);
  });
});
