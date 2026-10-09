import { describe, expect, it } from "vitest";

import { applySystemChoices, NUP_GUTTER, printSheets } from "./sheets";

const A4 = { width: 595.28, height: 841.89 };
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };
const LETTER = { width: 612, height: 792 };

describe("printSheets", () => {
  it("prints a page on a sheet of its own size, as it is", () => {
    const sheets = printSheets({
      pages: [0, 2],
      page: A4,
      perSheet: 1,
      scale: "actual",
    });

    expect(sheets).toEqual([
      { ...A4, placements: [{ page: 0, x: 0, y: 0, scale: 1 }] },
      { ...A4, placements: [{ page: 2, x: 0, y: 0, scale: 1 }] },
    ]);
  });

  it("centers a page at its actual size on other paper, or fits it", () => {
    const [actual] = printSheets({
      pages: [0],
      page: A4,
      perSheet: 1,
      scale: "actual",
      paper: LETTER,
    });
    expect(actual.width).toBe(612);
    expect(actual.placements[0]).toMatchObject({ scale: 1 });
    expect(actual.placements[0].x).toBeCloseTo((612 - 595.28) / 2);
    expect(actual.placements[0].y).toBeCloseTo((792 - 841.89) / 2);

    const [fit] = printSheets({
      pages: [0],
      page: A4,
      perSheet: 1,
      scale: "fit",
      paper: LETTER,
    });
    const k = 792 / 841.89;
    expect(fit.placements[0].scale).toBeCloseTo(k);
    expect(fit.placements[0].x).toBeCloseTo((612 - 595.28 * k) / 2);
    expect(fit.placements[0].y).toBeCloseTo(0);
  });

  it("turns paper to the page for one page per sheet", () => {
    const [sheet] = printSheets({
      pages: [0],
      page: A4_LANDSCAPE,
      perSheet: 1,
      scale: "fit",
      paper: A4,
    });
    expect(sheet).toMatchObject(A4_LANDSCAPE);
    expect(sheet.placements[0]).toEqual({ page: 0, x: 0, y: 0, scale: 1 });
  });

  it("puts two portrait pages side by side on a landscape sheet", () => {
    const sheets = printSheets({
      pages: [0, 1, 2],
      page: A4,
      perSheet: 2,
      scale: "actual",
    });

    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toMatchObject(A4_LANDSCAPE);
    const [left, right] = sheets[0].placements;
    const cell = (841.89 - 3 * NUP_GUTTER) / 2;
    const k = Math.min(cell / 595.28, (595.28 - 2 * NUP_GUTTER) / 841.89);
    expect(left.scale).toBeCloseTo(k);
    expect(right.scale).toBeCloseTo(k);
    expect(left.y).toBeCloseTo(right.y);
    expect(right.x - left.x).toBeCloseTo(cell + NUP_GUTTER);
    // centered in its cell, within the gutters
    expect(left.x).toBeCloseTo(NUP_GUTTER + (cell - 595.28 * k) / 2);
    expect(left.y).toBeGreaterThanOrEqual(NUP_GUTTER - 0.001);
    // the last sheet holds what's left
    expect(sheets[1].placements.map((placement) => placement.page)).toEqual([
      2,
    ]);
    expect(sheets[1].placements[0]).toMatchObject({ x: left.x, y: left.y });
  });

  it("puts two landscape pages above each other on a portrait sheet", () => {
    const [sheet] = printSheets({
      pages: [0, 1],
      page: A4_LANDSCAPE,
      perSheet: 2,
      scale: "fit",
    });

    expect(sheet).toMatchObject(A4);
    const [top, bottom] = sheet.placements;
    expect(top.x).toBeCloseTo(bottom.x);
    expect(bottom.y).toBeGreaterThan(top.y + 595.28 * top.scale);
  });

  it("puts four pages in two rows, left to right, on a sheet like the page", () => {
    const [sheet] = printSheets({
      pages: [3, 4, 5, 6],
      page: A4,
      perSheet: 4,
      scale: "actual",
    });

    expect(sheet).toMatchObject(A4);
    const [a, b, c, d] = sheet.placements;
    expect(sheet.placements.map((placement) => placement.page)).toEqual([
      3, 4, 5, 6,
    ]);
    expect(a.y).toBeCloseTo(b.y);
    expect(b.x).toBeGreaterThan(a.x);
    expect(c.x).toBeCloseTo(a.x);
    expect(c.y).toBeGreaterThan(a.y);
    expect(d.x).toBeCloseTo(b.x);
    // each fits its cell
    expect(595.28 * a.scale).toBeLessThanOrEqual(
      (595.28 - 3 * NUP_GUTTER) / 2 + 0.001,
    );
    expect(841.89 * a.scale).toBeLessThanOrEqual(
      (841.89 - 3 * NUP_GUTTER) / 2 + 0.001,
    );
  });

  it("places pages several to a sheet on the paper the system chose", () => {
    const [sheet] = printSheets({
      pages: [0, 1],
      page: A4,
      perSheet: 2,
      scale: "actual",
      paper: LETTER,
    });

    expect(sheet).toMatchObject({ width: 792, height: 612 });
  });
});

describe("applySystemChoices", () => {
  const sheets = printSheets({
    pages: [0, 1, 2, 3],
    page: A4,
    perSheet: 1,
    scale: "actual",
  });

  it("keeps every sheet as it is without choices", () => {
    expect(applySystemChoices(sheets, {})).toEqual(sheets);
    expect(applySystemChoices(sheets, { scale: 100 })).toEqual(sheets);
  });

  it("keeps the sheets of the ranges", () => {
    const kept = applySystemChoices(sheets, {
      ranges: [
        [0, 0],
        [2, 3],
      ],
    });
    expect(kept.map((sheet) => sheet.placements[0].page)).toEqual([0, 2, 3]);
  });

  it("scales the pages on their sheets", () => {
    const [sheet] = applySystemChoices(sheets.slice(0, 1), { scale: 50 });
    expect(sheet.width).toBe(A4.width);
    expect(sheet.placements[0]).toEqual({ page: 0, x: 0, y: 0, scale: 0.5 });
  });
});
