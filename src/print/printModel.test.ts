import { describe, expect, it } from "vitest";

import { MARGIN_PRESETS } from "../layout/choices";
import { allMargins } from "../layout/settings";
import { cm, testLayout } from "../test/layout";
import {
  chosenPages,
  effectiveLayout,
  isPrintSettings,
  parsePages,
  PRINT_DEFAULTS,
  printPaper,
  sentMessage,
  sheetLabel,
  summary,
} from "./printModel";
import { printSheets } from "./sheets";

describe("parsePages", () => {
  it("reads numbers and ranges, in order and each once", () => {
    expect(parsePages("1-3, 5", 9)).toEqual({ pages: [1, 2, 3, 5] });
    expect(parsePages("5; 2 ;2", 9)).toEqual({ pages: [2, 5] });
    expect(parsePages(" 3 - 4 ", 9)).toEqual({ pages: [3, 4] });
    expect(parsePages("1–2, 4—5", 9)).toEqual({ pages: [1, 2, 4, 5] });
  });

  it("reads open ranges to the ends", () => {
    expect(parsePages("4-", 6)).toEqual({ pages: [4, 5, 6] });
    expect(parsePages("-2", 6)).toEqual({ pages: [1, 2] });
  });

  it("says what is wrong and how to write it", () => {
    expect(parsePages("9", 2)).toEqual({
      error: "There is no page 9. This document has 2 pages.",
    });
    expect(parsePages("1-3", 1)).toEqual({
      error: "There is no page 3. This document has 1 page.",
    });
    expect(parsePages("3-1", 5)).toEqual({
      error: "3-1 runs backwards. Write it as 1-3.",
    });
    expect(parsePages("2, a", 5)).toEqual({
      error: "“a” isn't a page or a range. Use numbers, like 1-3, 5.",
    });
    expect(parsePages("-", 5)).toEqual({
      error: "“-” isn't a page or a range. Use numbers, like 1-3, 5.",
    });
    expect(parsePages("0", 5)).toEqual({ error: "Pages start at 1." });
    // spaces don't join numbers
    expect(parsePages("1 2", 5)).toEqual({
      error: "“1 2” isn't a page or a range. Use numbers, like 1-3, 5.",
    });
  });

  it("asks for pages when there are none", () => {
    const error = { error: "Type the pages to print, like 1-3, 5." };
    expect(parsePages("", 5)).toEqual(error);
    expect(parsePages(" , ;", 5)).toEqual(error);
  });
});

describe("chosenPages", () => {
  it("gives the pages by their index", () => {
    expect(chosenPages("all", 3, 1, "")).toEqual({ pages: [0, 1, 2] });
    expect(chosenPages("current", 3, 1, "")).toEqual({ pages: [1] });
    expect(chosenPages("custom", 3, 1, "1, 3")).toEqual({ pages: [0, 2] });
    expect(chosenPages("custom", 3, 1, "4")).toHaveProperty("error");
  });
});

describe("the print settings", () => {
  it("are told from what isn't", () => {
    expect(isPrintSettings(PRINT_DEFAULTS)).toBe(true);
    expect(
      isPrintSettings({
        destination: "pdf",
        perSheet: 4,
        scale: "fit",
        more: true,
      }),
    ).toBe(true);
    expect(isPrintSettings(null)).toBe(false);
    expect(isPrintSettings({ ...PRINT_DEFAULTS, perSheet: 3 })).toBe(false);
    expect(isPrintSettings({ ...PRINT_DEFAULTS, destination: "fax" })).toBe(
      false,
    );
    expect(isPrintSettings({ ...PRINT_DEFAULTS, more: "yes" })).toBe(false);
  });

  it("start with the printer, one page per sheet at actual size", () => {
    expect(PRINT_DEFAULTS).toEqual({
      destination: "printer",
      perSheet: 1,
      scale: "actual",
      more: false,
    });
  });

  it("lay a PDF file out page by page, whatever is remembered", () => {
    expect(effectiveLayout("pdf", 4, "fit")).toEqual({
      perSheet: 1,
      scale: "actual",
    });
    expect(effectiveLayout("printer", 4, "fit")).toEqual({
      perSheet: 4,
      scale: "fit",
    });
  });
});

describe("the print dialog's words", () => {
  const page = { width: 595.28, height: 841.89 };

  it("sum up what prints", () => {
    const base = { copies: 1, destination: "printer" } as const;
    expect(summary({ ...base, pages: 1, sheets: 1, perSheet: 1 })).toBe(
      "1 page",
    );
    expect(summary({ ...base, pages: 3, sheets: 2, perSheet: 2 })).toBe(
      "3 pages on 2 sheets",
    );
    expect(
      summary({ ...base, pages: 3, sheets: 2, perSheet: 2, copies: 2 }),
    ).toBe("3 pages on 2 sheets, 2 copies");
    expect(
      summary({
        pages: 3,
        sheets: 3,
        perSheet: 1,
        copies: 2,
        destination: "pdf",
      }),
    ).toBe("3 pages");
  });

  it("name the sheet the preview shows", () => {
    const all = printSheets({
      pages: [0, 1, 2],
      page,
      perSheet: 1,
      scale: "actual",
    });
    expect(
      sheetLabel({ sheets: all, index: 1, total: 3, perSheet: 1, all: true }),
    ).toBe("Page 2 of 3");
    const some = printSheets({
      pages: [1, 4],
      page,
      perSheet: 1,
      scale: "actual",
    });
    expect(
      sheetLabel({ sheets: some, index: 1, total: 6, perSheet: 1, all: false }),
    ).toBe("Page 5 (2 of 2)");
    const twoUp = printSheets({
      pages: [0, 1, 2],
      page,
      perSheet: 2,
      scale: "actual",
    });
    expect(
      sheetLabel({ sheets: twoUp, index: 0, total: 3, perSheet: 2, all: true }),
    ).toBe("Sheet 1 of 2, pages 1, 2");
    expect(
      sheetLabel({ sheets: twoUp, index: 1, total: 3, perSheet: 2, all: true }),
    ).toBe("Sheet 2 of 2, page 3");
  });

  it("say where the pages went", () => {
    expect(sentMessage(3, "Office printer")).toBe(
      "Sent 3 pages to Office printer",
    );
    expect(sentMessage(1)).toBe("Sent 1 page to the printer");
  });

  it("name the paper and its margins", () => {
    expect(printPaper(testLayout(), "cm")).toBe("A4, normal margins");
    const narrow = allMargins(MARGIN_PRESETS.narrow);
    expect(
      printPaper(
        testLayout({ orientation: "landscape", margins: narrow }),
        "cm",
      ),
    ).toBe("A4 landscape, narrow margins");
    expect(printPaper(testLayout({ margins: allMargins(cm(2)) }), "cm")).toBe(
      "A4",
    );
  });
});
