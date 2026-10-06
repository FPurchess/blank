import { describe, expect, it } from "vitest";

import { describePaper, layoutWarnings } from "./describe";
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

describe("layoutWarnings", () => {
  it("explains the problems in one warning", () => {
    expect(layoutWarnings(["page.size", "page.margins"])).toEqual([
      "Blank used the default page setup where its paper size is unknown, its margins can't be used",
    ]);
    expect(layoutWarnings([])).toEqual([]);
  });

  it("says the margin is small for the band, which was kept", () => {
    expect(
      layoutWarnings(["page.size", "page.header-room", "page.footer-room"]),
    ).toEqual([
      "Blank used the default page setup where its paper size is unknown",
      "The top margin is small for the header",
      "The bottom margin is small for the footer",
    ]);
  });
});
