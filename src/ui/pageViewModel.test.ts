import { describe, expect, it } from "vitest";

import type { FrameLayout } from "../engine/frames";
import { testLayout } from "../test/layout";
import {
  caretLine,
  movesPages,
  endMark,
  firstHeaderPlace,
  lastFooterPlace,
  pageLabel,
  propertiesPlace,
  sheetSlots,
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

describe("propertiesPlace", () => {
  it("puts the properties above the first page and its header", () => {
    expect(propertiesPlace(pages)).toEqual({ left: 40, top: 68, width: 600 });
    expect(propertiesPlace({ ...pageEnds, headerRoom: 20 })).toEqual({
      left: 76,
      top: 48,
      width: 528,
    });
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
