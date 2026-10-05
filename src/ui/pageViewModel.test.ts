import { describe, expect, it } from "vitest";

import type { FrameLayout } from "../engine/frames";
import { testLayout } from "../test/layout";
import {
  bandBox,
  bandPlace,
  caretLine,
  edgeHintPlace,
  movesPages,
  endMark,
  firstHeaderPlace,
  lastFooterPlace,
  pageLabel,
  sheetSlots,
  slotRowPlace,
  stripPlace,
} from "./pageViewModel";

// two frames of "page ends" at 1.5 px per point, and of "pages"
const frame = { page: 0, top: 100, left: 40, width: 600, height: 900 };
const place = { x: 0, y: 0, w: 400, h: 600 };
const pageEnds: FrameLayout = {
  mode: "page-ends",
  scale: 1.5,
  frames: [{ ...frame, ...place }],
  height: 1200,
  headerRoom: 0,
  footerRoom: 0,
};
const pages: FrameLayout = { ...pageEnds, mode: "pages" };

describe("endMark", () => {
  const footer = (center: string) =>
    testLayout({ footer: { left: "", center, right: "" } });

  it("shows the footer, the number without one, and the next header", () => {
    const bands = ["T", "", "", "", "2 of 5", ""];
    expect(
      endMark(
        1,
        bands,
        ["Next", "", "", "", "", ""],
        footer("{page} of {pages}"),
      ),
    ).toEqual({
      footer: ["", "2 of 5", ""],
      number: "",
      header: ["Next", "", ""],
    });
    expect(
      endMark(
        1,
        ["", "", "", "", "", ""],
        ["", "", "", "", "", ""],
        testLayout(),
      ),
    ).toMatchObject({
      number: "2",
      header: ["", "", ""],
    });
  });

  it("numbers the page as the pages are numbered", () => {
    const empty = ["", "", "", "", "", ""];
    // roman numerals, where the footer has none
    expect(
      endMark(1, empty, empty, testLayout({ numberStyle: "i" })).number,
    ).toBe("ii");
    // and not twice where it has: "ii" and "2" aren't the same text
    expect(
      endMark(1, ["", "", "", "", "ii", ""], empty, {
        ...footer("{page}"),
        numberStyle: "i",
      }).number,
    ).toBe("");
    // from the number the first page starts at
    expect(
      endMark(0, empty, empty, testLayout({ startNumber: 5 })).number,
    ).toBe("5");
    // a footer that reads a number that isn't the page's
    expect(
      endMark(1, ["", "", "", "", "Chapter 2", ""], empty, footer("Chapter 2"))
        .number,
    ).toBe("2");
    // nor is a written {page}
    expect(endMark(1, empty, empty, footer("{{page}")).number).toBe("2");
  });
});

describe("firstHeaderPlace", () => {
  it("puts the first page's header in the room above its text in page ends", () => {
    // the frame shows 24 pt beside the text
    expect(firstHeaderPlace({ ...pageEnds, headerRoom: 20 })).toEqual({
      left: 76,
      top: 80,
      width: 528,
      height: 20,
    });
  });

  it("shows none without room for it, or on the sheets of pages", () => {
    expect(firstHeaderPlace(pageEnds)).toBeNull();
    expect(firstHeaderPlace({ ...pages, headerRoom: 20 })).toBeNull();
    expect(
      firstHeaderPlace({ ...pageEnds, headerRoom: 20, frames: [] }),
    ).toBeNull();
  });
});

describe("lastFooterPlace", () => {
  it("puts the last page's footer in the room below its text in page ends", () => {
    const second = { ...frame, ...place, page: 1, top: 1100, height: 300 };
    expect(
      lastFooterPlace({
        ...pageEnds,
        frames: [pageEnds.frames[0], second],
        footerRoom: 52,
      }),
    ).toEqual({ left: 76, top: 1400, width: 528, height: 52 });
  });

  it("shows none without room for it, or on the sheets of pages", () => {
    expect(lastFooterPlace(pageEnds)).toBeNull();
    expect(lastFooterPlace({ ...pages, footerRoom: 52 })).toBeNull();
    expect(
      lastFooterPlace({ ...pageEnds, footerRoom: 52, frames: [] }),
    ).toBeNull();
  });
});

describe("sheetSlots", () => {
  it("places the slots that name a placeholder where the engine sets them", () => {
    const page = {
      width: 600,
      height: 800,
      margins: { top: 72, right: 60, bottom: 72, left: 60 },
    };
    const none: { text: string }[] = [];
    const slots = sheetSlots(
      [
        [{ field: "author" }],
        none,
        [{ text: "x" }],
        none,
        [{ text: "by " }, { field: "author" }],
        none,
      ],
      page,
      2,
    );
    // a third of the text's width each, at 8.8 pt
    expect(slots).toEqual([
      expect.objectContaining({
        key: 0,
        slot: "left",
        named: true,
        left: 120,
        top: 72,
        width: 320,
        size: 17.6,
      }),
      expect.objectContaining({
        key: 4,
        slot: "center",
        named: false,
        left: 440,
        // the footer as far above the bottom edge as the header is below the
        // top: 800 - 36 - 8.8 * 1.3
        top: expect.closeTo((800 - 36 - 8.8 * 1.3) * 2, 6),
      }),
    ]);
  });
});

describe("caretLine", () => {
  it.each([1, 1.5, 2])(
    "draws the caret on whole device pixels at %s×",
    (ratio) => {
      const { left, width } = caretLine(100.3, ratio);
      expect(Number.isInteger(Math.round(left * ratio * 1000) / 1000)).toBe(
        true,
      );
      expect(Number.isInteger(Math.round(width * ratio * 1000) / 1000)).toBe(
        true,
      );
      expect(width * ratio).toBeGreaterThanOrEqual(1);
      // around the spot, within a device pixel
      expect(Math.abs(left + width / 2 - 100.3)).toBeLessThanOrEqual(1 / ratio);
    },
  );
});

describe("pageLabel", () => {
  it("counts the pages from 1, whatever number they show", () => {
    expect(pageLabel({ page: 2, pages: 10 })).toBe("Page 2 of 10");
  });
});

describe("movesPages", () => {
  it("tells a layout that moves the pages from one that keeps them", () => {
    expect(movesPages(pageEnds, { ...pageEnds })).toBe(false);
    expect(movesPages(pages, pageEnds)).toBe(true);
    expect(movesPages({ ...pageEnds, scale: 2 }, pageEnds)).toBe(true);
    // the header of the first page takes room above it
    expect(movesPages({ ...pageEnds, headerRoom: 20 }, pageEnds)).toBe(true);
    const lower = { ...frame, ...place, top: 128 };
    expect(movesPages({ ...pageEnds, frames: [lower] }, pageEnds)).toBe(true);
  });
});

// a page of 400 by 600 points with margins of 72, 50, 80 and 60
const setup = {
  width: 400,
  height: 600,
  margins: { top: 72, right: 50, bottom: 80, left: 60 },
};

describe("bandBox", () => {
  it("is as wide as the text, where the engine sets the band", () => {
    const header = bandBox(setup, "header", 2);
    expect(header).toMatchObject({ left: 120, top: 72, width: 580 });
    expect(header.size).toBeCloseTo(17.6);
    expect(header.height).toBeCloseTo(17.6 * 1.3);
    // the footer moved down by what the margin leaves beyond 36 pt and a line
    const footer = bandBox(setup, "footer", 1);
    expect(footer.top).toBeCloseTo(520 + 80 - 36 - 8.8 * 1.3);
  });

  it("is the slots of sheetSlots, a third each", () => {
    const named = sheetSlots(
      [[], [], [], [], [], [{ field: "author" }]],
      setup,
      2,
    );
    const footer = bandBox(setup, "footer", 2);
    expect(named[0]).toMatchObject({
      slot: "right",
      top: footer.top,
      width: footer.width / 3,
    });
    expect(named[0].left).toBeCloseTo(footer.left + (2 * footer.width) / 3);
  });
});

describe("bandPlace", () => {
  it("is the band on its sheet in pages", () => {
    const placed = bandPlace(pages, 0, "header", setup)!;
    expect(placed.sheet).toEqual({
      left: 40,
      top: 100,
      width: 600,
      height: 900,
    });
    expect(placed.band).toMatchObject({
      left: 40 + 60 * 1.5,
      top: 100 + 36 * 1.5,
      width: 290 * 1.5,
    });
  });

  it("is the line a gap above or below the text in page ends", () => {
    const header = bandPlace(pageEnds, 0, "header", setup)!.band;
    // inset as the text, and no higher than the desk's top
    expect(header).toMatchObject({ left: 40 + 36, top: 48, width: 600 - 72 });
    expect(header.height).toBe(20);
    expect(header.size).toBe(11);
    expect(bandPlace(pageEnds, 0, "footer", setup)!.band.top).toBe(
      100 + 900 + 32,
    );
  });

  it("is nothing for a page that isn't laid out", () => {
    expect(bandPlace(pages, 3, "footer", setup)).toBeNull();
  });
});

describe("stripPlace", () => {
  const sheet = { left: 100, top: 0, width: 800, height: 1100 };
  const view = { left: 0, top: 80, width: 1000, height: 720 };
  // a band whose slots are 28 px high, 6.5 px above and below it
  const band = (top: number) => ({
    left: 180,
    top,
    width: 640,
    height: 15,
    size: 12,
  });
  const at = (which: "header" | "footer", top: number, windowWidth = 1000) =>
    stripPlace({
      sheet,
      band: band(top),
      which,
      view,
      height: 150,
      windowWidth,
    });

  it("goes below a header's slots and above a footer's, as wide as the sheet", () => {
    expect(at("header", 200)).toEqual({ left: 100, top: 229.5, width: 800 });
    expect(at("footer", 600)).toEqual({ left: 100, top: 435.5, width: 800 });
  });

  it("goes to the other side where the view has no room for it", () => {
    // a footer near the top of the view: below it
    expect(at("footer", 120).top).toBe(120 + 15 + 6.5 + 8);
    // a header near the bottom: above it
    expect(at("header", 700).top).toBe(700 - 6.5 - 150 - 8);
  });

  it("stays in the window and the view", () => {
    // a narrow window: the sheet wider than it, starting left of it
    expect(
      stripPlace({
        sheet: { ...sheet, left: -50 },
        band: band(200),
        which: "header",
        view,
        height: 150,
        windowWidth: 600,
      }),
    ).toMatchObject({ left: 8, width: 584 });
    // no room on either side: within the view, its bottom 8 px above the
    // view's
    expect(
      stripPlace({
        sheet,
        band: band(400),
        which: "footer",
        view: { ...view, height: 300 },
        height: 250,
        windowWidth: 1000,
      }).top,
    ).toBe(80 + 300 - 250 - 8);
  });

  it("follows the band as the view scrolls", () => {
    expect(at("footer", 500).top - at("footer", 600).top).toBe(-100);
  });
});

describe("slotRowPlace", () => {
  it("grows the band to a control's height, a little wider", () => {
    expect(
      slotRowPlace({ left: 100, top: 200, width: 600, height: 14, size: 9 }),
    ).toEqual({ left: 94, top: 193, width: 612, height: 28, fontSize: 12 });
    // a band shown larger keeps its size
    expect(
      slotRowPlace({ left: 0, top: 0, width: 600, height: 40, size: 20 }),
    ).toMatchObject({ top: 0, height: 40, fontSize: 20 });
  });
});

describe("edgeHintPlace", () => {
  it("offers a header right above the text, a footer a gap below it", () => {
    expect(edgeHintPlace(pageEnds, "header")).toEqual({
      left: 76,
      top: 76,
      width: 528,
      height: 24,
    });
    expect(edgeHintPlace(pageEnds, "footer")).toMatchObject({
      top: 100 + 900 + 32,
    });
  });

  it("leaves it to the sheets in pages", () => {
    expect(edgeHintPlace(pages, "footer")).toBeNull();
  });
});
