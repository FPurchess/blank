import { describe, expect, it, vi } from "vitest";

import {
  chooseFirstPage,
  firstPageMenu,
  mirror,
  mirrorOddPages,
  openStrip,
  pageNumberMenu,
  pagesShown,
  removeBand,
  showPages,
  stripLabel,
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
const fields = { title: "Report", author: "Ada", date: "1 May", file: "" };

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
    const strip = openStrip(
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

  it("shows the pages whose band the edge shows", () => {
    expect(openStrip("footer", bands({ firstPage: letterhead })).pages).toBe(
      "first",
    );
    expect(openStrip("footer", bands({ evenPages: letterhead })).pages).toBe(
      "even",
    );
    expect(openStrip("header", bands({ firstPage: letterhead })).pages).toBe(
      "every",
    );
  });
});

describe("pagesShown, tabLabel and stripLabel", () => {
  it("shows no tabs while every page has the same band", () => {
    const strip = openStrip("header", bands());

    expect(pagesShown(strip)).toEqual(["every"]);
    expect(stripLabel(strip)).toBe("Header · every page");
    expect(stripLabel(chooseFirstPage(strip, "plain"))).toBe(
      "Header · every page but the first",
    );
  });

  it("names the tabs of the first, odd and even pages", () => {
    const own = openStrip("footer", bands({ firstPage: letterhead }));
    expect(pagesShown(own).map((pages) => tabLabel(own, pages))).toEqual([
      "First Page",
      "Other Pages",
    ]);
    expect(stripLabel(own)).toBe("Footer");

    const both = toggleEvenPages(own);
    expect(pagesShown(both).map((pages) => tabLabel(both, pages))).toEqual([
      "First Page",
      "Odd Pages",
      "Even Pages",
    ]);
  });
});

describe("changing the strip", () => {
  const strip = openStrip("header", bands({ header }));

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
    const strip = withSlots(showPages(openStrip("header", initial), "first"), {
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
    const strip = chooseFirstPage(openStrip("header", initial), "own");
    expect(stripSettings(strip, initial).firstPage).toBe("plain");
  });

  it("leaves even pages like the others once they have none", () => {
    const initial = bands({ evenPages: letterhead });
    const strip = toggleEvenPages(openStrip("header", initial));
    expect(stripSettings(strip, initial).evenPages).toBeNull();
  });

  it("keeps the numbering", () => {
    const initial = bands();
    const strip = {
      ...openStrip("footer", initial),
      numberStyle: "I" as const,
    };
    expect(stripSettings(strip, initial)).toMatchObject({ numberStyle: "I" });
  });
});

describe("firstPageMenu", () => {
  it("checks what the first page has, and chooses", () => {
    const choose = vi.fn();
    const menu = items(firstPageMenu(openStrip("header", bands()), choose));

    expect(
      menu.map(({ label, checked, radio }) => [label, checked, radio]),
    ).toEqual([
      ["Like the Other Pages", true, true],
      ["None", false, true],
      ["Its Own", false, true],
    ]);
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

  it("offers the page numbers as they read, in the numbering of the strip", () => {
    const strip = {
      ...openStrip("footer", bands()),
      numberStyle: "i" as const,
    };
    const done = actions();
    const menu = pageNumberMenu(strip, fields, done);

    expect(
      menu.map((item) => (item === "separator" ? "-" : item.label)),
    ).toEqual([
      "iii",
      "Page iii",
      "iii of 12",
      "Page iii of 12",
      "-",
      "1, 2, 3",
      "i, ii, iii",
      "I, II, III",
      "-",
      "Start At 1…",
    ]);
    items(menu)[3].run?.();
    expect(done.insert).toHaveBeenCalledWith("Page {page} of {pages}");
    expect(items(menu)[5].checked).toBe(true);
    items(menu)[6].run?.();
    expect(done.setNumberStyle).toHaveBeenCalledWith("I");
  });

  it("takes a first number of 0 or more, as typed", () => {
    const done = actions();
    const menu = items(
      pageNumberMenu(openStrip("footer", bands()), fields, done),
    );
    const start = menu[menu.length - 1];

    for (const typed of [" 5 ", "0", "", "-1", "1.5", "x"]) {
      start.edit!.submit(typed);
    }

    expect(done.setStartNumber.mock.calls).toEqual([[5], [0]]);
  });
});
