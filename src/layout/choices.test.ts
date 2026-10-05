import { describe, expect, it } from "vitest";

import {
  HEADING_OPTIONS,
  changesOf,
  choicesOf,
  MARGIN_PRESETS,
  type PageChoices,
  paperOptions,
  settingsOf,
  sizeChoices,
  turned,
  typedOrientation,
} from "./choices";
import {
  allMargins,
  DEFAULT_PAGE,
  NO_SLOTS,
  type PageSettings,
  REMOVE,
} from "./settings";
import { cm, mm } from "../test/layout";

const settings = (changes: Partial<PageSettings> = {}): PageSettings => ({
  ...DEFAULT_PAGE,
  ...changes,
});

describe("paperOptions", () => {
  it("offers the paper of the region first, then the others", () => {
    expect(paperOptions("de-DE").map(({ label }) => label)).toEqual([
      "A4 (your region)",
      "A3",
      "A5",
      "B5",
      "Letter",
      "Legal",
      "Custom…",
    ]);
    expect(paperOptions("en-US").slice(0, 2)).toEqual([
      { value: "auto", label: "Letter (your region)" },
      { value: "a3", label: "A3" },
    ]);
  });
});

describe("HEADING_OPTIONS", () => {
  it("offers every heading level to start a new page", () => {
    expect(HEADING_OPTIONS.map(({ value }) => value)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(HEADING_OPTIONS[0]).toMatchObject({
      label: "Heading 1",
      short: "H1",
    });
  });
});

describe("choicesOf", () => {
  it("shows the defaults as the paper of the region and normal margins", () => {
    expect(choicesOf(DEFAULT_PAGE, "de-DE", "cm")).toEqual({
      paper: "auto",
      width: "210",
      height: "297",
      orientation: "portrait",
      margins: "normal",
      sides: { top: "2.5", right: "2.5", bottom: "2.5", left: "2.5" },
      newPageBefore: [],
      bands: {
        header: NO_SLOTS,
        footer: NO_SLOTS,
        firstPage: "same",
        evenPages: null,
        numberStyle: "1",
        startNumber: 1,
      },
    });
  });

  it("shows the paper of the region picked by name as the region's", () => {
    expect(choicesOf(settings({ size: "a4" }), "de-DE", "cm").paper).toBe(
      "auto",
    );
    expect(choicesOf(settings({ size: "a4" }), "en-US", "in").paper).toBe("a4");
  });

  it("shows a custom size that is known paper by its name", () => {
    const b5 = { width: mm(176), height: mm(250) };
    expect(choicesOf(settings({ size: b5 }), "de-DE", "cm").paper).toBe("b5");
    const other = { width: mm(170), height: mm(240) };
    expect(choicesOf(settings({ size: other }), "de-DE", "cm")).toMatchObject({
      paper: "custom",
      width: "170",
      height: "240",
    });
  });

  it("shows a custom size as it is turned, in inches where people use them", () => {
    const size = { width: 432, height: 648 };
    expect(
      choicesOf(settings({ size, orientation: "landscape" }), "en-US", "in"),
    ).toMatchObject({ orientation: "landscape", width: "9", height: "6" });
  });

  it("shows other margins as custom, in the unit", () => {
    const margins = { ...allMargins(72), top: 36 };
    expect(choicesOf(settings({ margins }), "en-US", "in")).toMatchObject({
      margins: "custom",
      sides: { top: "0.5", right: "1", bottom: "1", left: "1" },
    });
    expect(
      choicesOf(
        settings({ margins: allMargins(MARGIN_PRESETS.wide) }),
        "de-DE",
        "cm",
      ).margins,
    ).toBe("wide");
  });
});

describe("settingsOf", () => {
  const base = choicesOf(DEFAULT_PAGE, "de-DE", "cm");
  const of = (changes: Partial<PageChoices>, unit: "cm" | "in" = "cm") =>
    settingsOf({ ...base, ...changes }, "de-DE", unit);

  it("returns the settings of named choices", () => {
    expect(
      of({
        paper: "letter",
        orientation: "landscape",
        margins: "narrow",
        newPageBefore: [2, 1],
      }),
    ).toEqual({
      settings: {
        ...DEFAULT_PAGE,
        size: "letter",
        orientation: "landscape",
        margins: allMargins(cm(1.27)),
        newPageBefore: [1, 2],
      },
    });
  });

  it("keeps the header and footer, which the strips set", () => {
    const bands = {
      header: { ...NO_SLOTS, left: "{title}" },
      footer: { ...NO_SLOTS, center: "{page}" },
      firstPage: "plain" as const,
      startNumber: 3,
    };
    const choices = choicesOf(settings(bands), "de-DE", "cm");

    expect(settingsOf(choices, "de-DE", "cm")).toMatchObject({
      settings: bands,
    });
  });

  it("shows the heading levels that start a new page", () => {
    const choices = choicesOf(
      settings({ newPageBefore: [1, 3] }),
      "de-DE",
      "cm",
    );
    expect(choices.newPageBefore).toEqual([1, 3]);
    expect(settingsOf(choices, "de-DE", "cm")).toMatchObject({
      settings: { newPageBefore: [1, 3] },
    });
  });

  it("reads typed lengths in the unit, or in the unit they name", () => {
    expect(
      of({
        paper: "custom",
        width: "17cm",
        height: "240",
        margins: "custom",
        sides: { top: "3", right: "2,5", bottom: "1in", left: "20 mm" },
      }),
    ).toEqual({
      settings: {
        ...DEFAULT_PAGE,
        size: { width: cm(17), height: mm(240) },
        orientation: "portrait",
        margins: { top: cm(3), right: cm(2.5), bottom: 72, left: mm(20) },
        newPageBefore: [],
      },
    });
  });

  it("explains what can't be read", () => {
    expect(
      of({
        paper: "custom",
        width: "wide",
        margins: "custom",
        sides: { ...base.sides, top: "" },
      }),
    ).toEqual({
      errors: {
        paper: "Enter the width and height, e.g. 170 and 240.",
        margins: "Enter each margin as a length, e.g. 2.5.",
      },
    });
    expect(of({ paper: "custom", height: "" }, "in")).toEqual({
      errors: { paper: "Enter the width and height, e.g. 6 and 9." },
    });
  });

  it("refuses margins that leave no room for the text", () => {
    expect(
      of({
        paper: "a5",
        margins: "custom",
        sides: { ...base.sides, left: "12" },
      }),
    ).toEqual({
      errors: { margins: "The margins leave no room for the text." },
    });
  });

  it("says when the paper itself is too small for the text", () => {
    expect(
      of({ paper: "custom", width: "20", height: "300", margins: "narrow" }),
    ).toEqual({ errors: { paper: "The paper is too small for the text." } });
  });

  it("keeps a custom size wider than high as landscape", () => {
    expect(
      of({
        paper: "custom",
        width: "240",
        height: "170",
        orientation: "portrait",
      }),
    ).toMatchObject({
      settings: {
        size: { width: mm(170), height: mm(240) },
        orientation: "landscape",
      },
    });
    // a square one keeps the orientation chosen
    expect(
      of({
        paper: "custom",
        width: "200",
        height: "200",
        orientation: "landscape",
      }),
    ).toMatchObject({ settings: { orientation: "landscape" } });
  });
});

describe("sizeChoices", () => {
  it("shows a size in the paper's unit, turned", () => {
    const a4 = { width: mm(210), height: mm(297) };
    expect(sizeChoices(a4, "portrait", "cm")).toEqual({
      width: "210",
      height: "297",
    });
    expect(sizeChoices(a4, "landscape", "cm")).toEqual({
      width: "297",
      height: "210",
    });
    expect(sizeChoices({ width: 612, height: 792 }, "portrait", "in")).toEqual({
      width: "8.5",
      height: "11",
    });
  });
});

describe("typedOrientation and turned", () => {
  const size = (width: string, height: string) => ({ width, height });

  it("tells how a typed size is turned", () => {
    expect(typedOrientation(size("240", "170"), "cm")).toBe("landscape");
    expect(typedOrientation(size("17cm", "240"), "cm")).toBe("portrait");
    expect(typedOrientation(size("200", "200"), "cm")).toBeUndefined();
    expect(typedOrientation(size("wide", "200"), "cm")).toBeUndefined();
  });

  it("swaps a typed size that is turned the other way", () => {
    expect(turned(size("170", "240"), "landscape", "cm")).toEqual(
      size("240", "170"),
    );
    expect(turned(size("170", "240"), "portrait", "cm")).toEqual(
      size("170", "240"),
    );
    expect(turned(size("wide", "240"), "landscape", "cm")).toEqual(
      size("wide", "240"),
    );
  });
});

describe("changesOf", () => {
  const change = (
    before: PageSettings,
    after: PageSettings,
    defaults = DEFAULT_PAGE,
  ) => changesOf(before, after, defaults, "de-DE");

  it("changes nothing for the same settings", () => {
    expect(change(DEFAULT_PAGE, DEFAULT_PAGE)).toEqual({});
    // the paper of the region, by name or not
    expect(change(settings({ size: "a4" }), DEFAULT_PAGE)).toEqual({});
  });

  it("writes the rows that changed", () => {
    expect(
      change(
        DEFAULT_PAGE,
        settings({
          size: "a5",
          orientation: "landscape",
          margins: allMargins(72),
        }),
      ),
    ).toEqual({
      size: "a5",
      orientation: "landscape",
      margins: allMargins(72),
    });
  });

  it("removes a row that is back to the default", () => {
    expect(
      change(
        settings({
          size: "a5",
          orientation: "landscape",
          margins: allMargins(72),
        }),
        DEFAULT_PAGE,
      ),
    ).toEqual({ size: REMOVE, orientation: REMOVE, margins: REMOVE });
  });

  it("writes even pages like the others over a default that has their own", () => {
    const defaults = {
      ...DEFAULT_PAGE,
      evenPages: { header: { ...NO_SLOTS, left: "{page}" }, footer: NO_SLOTS },
    };
    expect(
      change(defaults, { ...defaults, evenPages: null }, defaults),
    ).toEqual({ evenPages: null });
  });

  it("writes a first page like the others over a default that has none", () => {
    const defaults: PageSettings = { ...DEFAULT_PAGE, firstPage: "plain" };
    expect(
      change(defaults, { ...defaults, firstPage: "same" }, defaults),
    ).toEqual({ firstPage: "same" });
  });

  it("follows the user's defaults", () => {
    const defaults = settings({ size: "letter" });
    expect(change(defaults, settings({ size: "auto" }), defaults)).toEqual({
      size: "auto",
    });
  });
});
