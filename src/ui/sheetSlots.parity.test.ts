import { describe, expect, it } from "vitest";

import { BAND, documentFields } from "../layout/bands";
import { pageBandParts } from "../layout/placeholders";
import { pageGeometry, type Layout } from "../layout/resolve";
import { doc, p } from "../test/editor";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import { sheetSlots } from "./pageViewModel";

// The page view names the placeholders of a header or footer over the text
// the engine painted there, so it repeats where the engine sets each slot
// (band_boxes in src-tauri/layout/src/engine/display.rs).

describe("the slots of a sheet's header and footer", () => {
  it("have the engine's size, distance and line", () => {
    const [size, distance, line] = testEngine().raw.bandMetrics();
    expect(size).toBeCloseTo(BAND.size, 5);
    expect(distance).toBe(BAND.distance);
    expect(line).toBeCloseTo(BAND.size * 1.3, 5);
  });

  it.each([
    ["the default margins", {}],
    [
      "narrow margins",
      { margins: { top: 20, right: 30, bottom: 20, left: 40 } },
    ],
  ])("hold the text the engine paints in them, with %s", (_, settings) => {
    // every slot shows text and a placeholder that comes out empty, so the
    // page view places them all
    const slot = (text: string) => `${text} {author}`;
    const layout: Layout = {
      ...testLayout(settings as Partial<Layout>),
      header: { left: slot("L"), center: slot("C"), right: slot("R") },
      footer: { left: slot("l"), center: slot("c"), right: slot("r") },
    };
    const node = doc(p("text"));
    const fields = documentFields(node);
    const engine = testEngine();
    engine.setSettings(layout, fields);
    engine.sync(node, () => undefined);

    const parts = pageBandParts(layout, 0, 1, fields, engine.bands(0));
    const slots = sheetSlots(parts, pageGeometry(layout), 1);
    expect(slots).toHaveLength(6);

    const glyphs = engine
      .bandDisplay(0, engine.bandVersions()[0])
      .g.flatMap((run) =>
        Array.from({ length: (run.length - 3) / 3 }, (_, index) => ({
          x: run[3 + index * 3 + 1],
          baseline: run[3 + index * 3 + 2],
        })),
      );
    // a letter and a space in each slot
    expect(glyphs).toHaveLength(12);
    // the display's numbers are rounded to thousandths of a point
    const inSlot = (
      { x, baseline }: (typeof glyphs)[number],
      { left, top, width, height }: (typeof slots)[number],
    ) =>
      x > left - 0.01 &&
      x < left + width + 0.01 &&
      baseline > top &&
      baseline < top + height + 0.01;
    for (const glyph of glyphs)
      expect(
        slots.filter((slot) => inSlot(glyph, slot)),
        `the glyph at ${glyph.x}, ${glyph.baseline}`,
      ).toHaveLength(1);
    for (const slot of slots)
      expect(glyphs.some((glyph) => inSlot(glyph, slot))).toBe(true);
  });
});
