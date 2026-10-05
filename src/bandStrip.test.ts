import { describe, expect, it, vi } from "vitest";

import {
  bandSummary,
  chooseFirstPage,
  firstPageLabel,
  firstPageMenu,
  mirror,
  mirrorOddPages,
  openStrip,
  pageNumberMenu,
  pagesShown,
  removeBand,
  showPages,
  stripSettings,
  tabLabel,
  toggleEvenPages,
  withSlots,
} from "./bandStrip";
import {
  type BandSettings,
  bandSettings,
  DEFAULT_PAGE,
  NO_BANDS,
  NO_SLOTS,
} from "./layout/settings";
import type { MenuItem } from "./state";

const bands = (settings: Partial<BandSettings> = {}): BandSettings => ({
  ...bandSettings(DEFAULT_PAGE),
  ...settings,
});
const header = { ...NO_SLOTS, left: "{title}", right: "{page}" };
const letterhead = { ...NO_BANDS, footer: { ...NO_SLOTS, left: "ACME" } };
// the strip as it opens without a page, e.g. without the layout engine
const open = (band: "header" | "footer", settings: BandSettings) =>
  openStrip(band, settings, null);

// the items of a menu that aren't separators
const items = (menu: MenuItem[]) =>
  menu.filter((item) => item !== "separator") as Exclude<
    MenuItem,
    "separator"
  >[];

describe("mirror", () => {
  it("swaps the left and right", () => {
    expect(mirror({ left: "a", center: "b", right: "c" })).toEqual({
      left: "c",
      center: "b",
      right: "a",
    });
  });
});

describe("openStrip", () => {
  it("takes the band of each of the pages, and what the pages have", () => {
    const strip = open(
      "header",
      bands({
        header,
        firstPage: { header: { ...NO_SLOTS, left: "ACME" }, footer: NO_SLOTS },
        evenPages: { header: mirror(header), footer: NO_SLOTS },
        numberStyle: "i",
        startNumber: 0,
      }),
    );

    expect(strip).toEqual({
      band: "header",
      slots: {
        every: header,
        first: { ...NO_SLOTS, left: "ACME" },
        even: mirror(header),
      },
      firstPage: "own",
      evenPages: true,
      numberStyle: "i",
      startNumber: 0,
      pages: "every",
    });
  });

  it("shows the band of the page it opens on", () => {
    const settings = bands({
      header,
      firstPage: letterhead,
      evenPages: letterhead,
    });
    expect(openStrip("footer", settings, 1).pages).toBe("first");
    expect(openStrip("footer", settings, 2).pages).toBe("even");
    expect(openStrip("footer", settings, 3).pages).toBe("every");
    // even by the number the page shows
    expect(openStrip("footer", { ...settings, startNumber: 2 }, 3).pages).toBe(
      "even",
    );
    // a first page without one edits the others'
    expect(
      openStrip("header", bands({ header, firstPage: "plain" }), 1).pages,
    ).toBe("every");
    expect(openStrip("header", bands({ header }), 2).pages).toBe("every");
  });

  it("shows the pages that have text without a page", () => {
    expect(open("footer", bands({ firstPage: letterhead })).pages).toBe(
      "first",
    );
    expect(open("footer", bands({ evenPages: letterhead })).pages).toBe("even");
    expect(open("header", bands({ firstPage: letterhead })).pages).toBe(
      "every",
    );
  });
});

describe("pagesShown, tabLabel and bandSummary", () => {
  it("shows no tabs while every page has the same band", () => {
    const strip = open("header", bands());

    expect(pagesShown(strip)).toEqual(["every"]);
    expect(bandSummary(strip)).toBe("on every page");
    expect(bandSummary(chooseFirstPage(strip, "plain"))).toBe(
      "not on the first page",
    );
  });

  it("names the tabs of the first, odd and even pages", () => {
    const own = open("footer", bands({ firstPage: letterhead }));
    expect(pagesShown(own).map((pages) => tabLabel(own, pages))).toEqual([
      "First page",
      "All pages",
    ]);
    expect(bandSummary(own)).toBe("its own on the first page");

    const both = toggleEvenPages(own);
    expect(pagesShown(both).map((pages) => tabLabel(both, pages))).toEqual([
      "First page",
      "Odd pages",
      "Even pages",
    ]);
    expect(bandSummary(both)).toBe(
      "its own on the first page · odd and even pages differ",
    );
  });
});

describe("changing the strip", () => {
  const strip = open("header", bands({ header }));

  it("keeps what the slots of the pages shown hold", () => {
    const changed = withSlots(strip, { ...NO_SLOTS, center: "x" });
    expect(changed.slots.every).toEqual({ ...NO_SLOTS, center: "x" });
    expect(showPages(changed, "even").pages).toBe("even");
  });

  it("shows the first page's band once it has its own, and not after", () => {
    const own = chooseFirstPage(strip, "own");
    expect(own).toMatchObject({ firstPage: "own", pages: "first" });
    expect(chooseFirstPage(own, "plain")).toMatchObject({
      firstPage: "plain",
      pages: "every",
    });
    expect(chooseFirstPage(showPages(own, "every"), "same").pages).toBe(
      "every",
    );
  });

  it("starts even pages mirrored, keeps theirs, and takes them away", () => {
    const even = toggleEvenPages(strip);
    expect(even).toMatchObject({ evenPages: true, pages: "even" });
    expect(even.slots.even).toEqual(mirror(header));

    const own = withSlots(even, { ...NO_SLOTS, center: "x" });
    const off = toggleEvenPages(own);
    expect(off).toMatchObject({ evenPages: false, pages: "every" });
    expect(toggleEvenPages(off).slots.even).toEqual({
      ...NO_SLOTS,
      center: "x",
    });
  });

  it("mirrors the odd pages again", () => {
    const even = withSlots(toggleEvenPages(strip), NO_SLOTS);
    expect(mirrorOddPages(even).slots.even).toEqual(mirror(header));
  });

  it("removes the band from every page", () => {
    expect(removeBand(toggleEvenPages(strip)).slots).toEqual({
      every: NO_SLOTS,
      first: NO_SLOTS,
      even: NO_SLOTS,
    });
  });
});

describe("stripSettings", () => {
  it("keeps the band on each of the pages, next to the other band", () => {
    const initial = bands({
      firstPage: letterhead,
      evenPages: { ...NO_BANDS, footer: { ...NO_SLOTS, right: "{page}" } },
    });
    const strip = withSlots(showPages(open("header", initial), "first"), {
      ...NO_SLOTS,
      left: "Title page",
    });

    expect(stripSettings(strip, initial)).toEqual({
      ...initial,
      firstPage: {
        header: { ...NO_SLOTS, left: "Title page" },
        footer: letterhead.footer,
      },
    });
  });

  it("makes a first page of its own without text plain", () => {
    const initial = bands();
    const strip = chooseFirstPage(open("header", initial), "own");
    expect(stripSettings(strip, initial).firstPage).toBe("plain");
  });

  it("leaves even pages like the others once they have none", () => {
    const initial = bands({ evenPages: letterhead });
    const strip = toggleEvenPages(open("header", initial));
    expect(stripSettings(strip, initial).evenPages).toBeNull();
  });

  it("keeps the numbering", () => {
    const initial = bands();
    const strip = {
      ...open("footer", initial),
      numberStyle: "I" as const,
    };
    expect(stripSettings(strip, initial)).toMatchObject({ numberStyle: "I" });
  });
});

describe("firstPageMenu", () => {
  it("checks what the first page has, and chooses", () => {
    const choose = vi.fn();
    const menu = items(firstPageMenu(open("header", bands()), choose));

    expect(
      menu.map(({ label, checked, radio }) => [label, checked, radio]),
    ).toEqual([
      ["The same as the others", true, true],
      ["None", false, true],
      ["Its own", false, true],
    ]);
    expect(firstPageLabel(open("header", bands()))).toBe(
      "The same as the others",
    );
    expect(firstPageLabel(open("header", bands({ firstPage: "plain" })))).toBe(
      "None",
    );
    menu[2].run?.();
    expect(choose).toHaveBeenCalledWith("own");
  });
});

describe("pageNumberMenu", () => {
  const actions = () => ({
    insert: vi.fn(),
    setNumberStyle: vi.fn(),
    setStartNumber: vi.fn(),
  });

  it("offers the page numbers as they read on the first page, in the numbering of the strip", () => {
    const strip = {
      ...open("footer", bands()),
      numberStyle: "i" as const,
    };
    const done = actions();
    const menu = pageNumberMenu(strip, done);

    expect(
      menu.map((item) => (item === "separator" ? "-" : item.label)),
    ).toEqual([
      "i",
      "Page i",
      "i of 2",
      "Page i of 2",
      "-",
      "1, 2, 3",
      "i, ii, iii",
      "I, II, III",
      "-",
      "Start at 1…",
    ]);
    items(menu)[3].run?.();
    expect(done.insert).toHaveBeenCalledWith("Page {page} of {pages}");
    expect(items(menu)[5].checked).toBe(true);
    items(menu)[6].run?.();
    expect(done.setNumberStyle).toHaveBeenCalledWith("I");
  });

  it("takes a first number of 0 or more, as typed", () => {
    const done = actions();
    const menu = items(pageNumberMenu(open("footer", bands()), done));
    const start = menu[menu.length - 1];

    for (const typed of [" 5 ", "0", "", "-1", "1.5", "x"]) {
      start.edit!.submit(typed);
    }

    expect(done.setStartNumber.mock.calls).toEqual([[5], [0]]);
  });
});
