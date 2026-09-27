import { describe, expect, it } from "vitest";

import {
  describePage,
  describePageSize,
  describePaper,
  layoutWarnings,
} from "./describe";
import { layoutOf } from "./resolve";
import { DEFAULT_PAGE, type PageSettings } from "./settings";
import { cm } from "../test/layout";

describe("describePaper", () => {
  const describe_ = (settings: Partial<PageSettings>, unit?: "cm" | "in") =>
    describePaper(layoutOf({ ...DEFAULT_PAGE, ...settings }, "de-DE"), unit);

  it.each([
    [{}, "A4"],
    [{ size: "letter" as const }, "Letter"],
    [{ orientation: "landscape" as const }, "A4 landscape"],
    [{ size: { width: cm(17), height: cm(24) } }, "170 × 240 mm"],
  ])("names %j", (settings, name) => {
    expect(describe_(settings)).toBe(name);
  });

  it("measures custom paper in inches where people do", () => {
    expect(describe_({ size: { width: 432, height: 648 } }, "in")).toBe(
      "6 × 9 in",
    );
  });
});

describe("describePageSize", () => {
  it.each([
    [{}, "cm", "A4 (portrait)"],
    [
      { size: "letter" as const, orientation: "landscape" as const },
      "in",
      "Letter (landscape)",
    ],
    [
      { size: { width: cm(17), height: cm(24) } },
      "cm",
      "170 × 240 mm (portrait)",
    ],
  ] as const)("names %j with its orientation", (settings, unit, name) => {
    expect(
      describePageSize(
        layoutOf({ ...DEFAULT_PAGE, ...settings }, "de-DE"),
        unit,
      ),
    ).toBe(name);
  });
});

describe("describePage", () => {
  it.each([
    [{ size: "a5" }, "A5"],
    [{ size: "a5", orientation: "landscape" }, "A5 landscape"],
    [{ orientation: "portrait" }, "portrait"],
    [{ margins: "2cm" }, "margins 2 cm"],
    [{ size: "letter", margins: "1in" }, "Letter · margins 2.54 cm"],
    [{ margins: { top: "3cm" } }, "custom margins"],
    [{ size: "170mm x 240mm" }, "170 × 240 mm"],
    [{ "new-page-before": 1 }, "chapters on new pages"],
    [{ "new-page-before": [2, 1, 3] }, "headings 1, 2 and 3 on new pages"],
    [{ "new-page-before": [] }, null],
  ])("sums up %j", (page, summary) => {
    expect(describePage(page, "cm")).toBe(summary);
  });

  it("measures in inches where people do", () => {
    expect(describePage({ margins: "2.54cm" }, "in")).toBe("margins 1 in");
  });

  it.each([undefined, null, "a4", ["a4"], {}, { size: "auto" }, { other: 1 }])(
    "says nothing for %j",
    (page) => {
      expect(describePage(page, "cm")).toBeNull();
    },
  );
});

describe("layoutWarnings", () => {
  it("explains the problems in one warning", () => {
    expect(layoutWarnings(["page.size", "page.margins"])).toEqual([
      "Blank used the default page setup where its paper size is unknown, its margins can't be used",
    ]);
    expect(layoutWarnings([])).toEqual([]);
  });
});
