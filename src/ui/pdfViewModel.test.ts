import { describe, expect, it } from "vitest";

import { sheetLayout } from "../engine/frames";
import {
  closedKeys,
  MAX_PAGE_PIXELS,
  pageInView,
  pageKey,
  pageSlot,
  pdfPaper,
  renderScale,
  scrollBy,
} from "./pdfViewModel";

const a4 = { width: 595, height: 842 };

describe("the page view of PDFs", () => {
  it("draws a page at the eighth above what the screen needs", () => {
    expect(renderScale(a4, 1, 2)).toBe(2);
    expect(renderScale(a4, 0.81, 2)).toBe(1.625);
    expect(renderScale(a4, 0.8, 1)).toBe(0.875);
  });

  it("draws a page no bigger than the helper allows", () => {
    const scale = renderScale(a4, 4, 3);
    expect(a4.width * scale * a4.height * scale).toBeLessThanOrEqual(
      MAX_PAGE_PIXELS,
    );
    expect(scale).toBeGreaterThan(4);
  });

  it("forgets the bitmaps of closed tabs only", () => {
    const keys = [
      pageKey(pageSlot("a", "x", 0), 2),
      pageKey(pageSlot("b", "y", 3), 1.5),
    ];
    expect(closedKeys(keys, new Set(["a"]))).toEqual([keys[1]]);
  });

  it("counts the page at the reading line", () => {
    const layout = sheetLayout([a4, a4, a4], 800);
    expect(pageInView(layout, 0, 600)).toBe(0);
    expect(pageInView(layout, layout.frames[1].top, 600)).toBe(1);
    expect(pageInView(layout, layout.height, 600)).toBe(2);
  });

  it("names the paper as the status bar does", () => {
    expect(pdfPaper(a4, "cm")).toBe("A4");
    expect(pdfPaper({ width: 842, height: 595 }, "cm")).toBe("A4 landscape");
    expect(pdfPaper({ width: 612, height: 792 }, "in")).toBe("Letter");
    expect(pdfPaper({ width: 595.28, height: 280 }, "cm")).toBe(
      "210 × 98.8 mm",
    );
  });

  it("scrolls by a line, a view or to an end", () => {
    expect(scrollBy("ArrowDown", false, 600)).toBe(40);
    expect(scrollBy("PageUp", false, 600)).toBe(-560);
    expect(scrollBy(" ", true, 600)).toBe(-560);
    expect(scrollBy("End", false, 600)).toBe(Infinity);
    expect(scrollBy("a", false, 600)).toBeNull();
  });
});
