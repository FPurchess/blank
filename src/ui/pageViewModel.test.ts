import { describe, expect, it } from "vitest";

import type { FrameLayout } from "../engine/frames";
import { testLayout } from "../test/layout";
import {
  anchorTop,
  caretLine,
  movesPages,
  endMark,
  firstHeaderPlace,
  pageLabel,
  propertiesPlace,
  scrollFor,
  viewAnchor,
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
};
const pages: FrameLayout = { ...pageEnds, mode: "pages" };

describe("scrollFor", () => {
  it("scrolls only as far as needed", () => {
    expect(scrollFor({ top: 300, height: 20 }, 0, 600)).toBeNull();
    expect(scrollFor({ top: 900, height: 20 }, 0, 600)).toBe(
      900 + 20 + 64 - 600,
    );
    expect(scrollFor({ top: 100, height: 20 }, 500, 600)).toBe(36);
  });
});

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
      endMark(1, ["", "", "", "", "", ""], null, testLayout()),
    ).toMatchObject({
      number: "2",
      header: ["", "", ""],
    });
  });

  it("numbers the page as the pages are numbered", () => {
    const empty = ["", "", "", "", "", ""];
    // roman numerals, where the footer has none
    expect(
      endMark(1, empty, null, testLayout({ numberStyle: "i" })).number,
    ).toBe("ii");
    // and not twice where it has: "ii" and "2" aren't the same text
    expect(
      endMark(1, ["", "", "", "", "ii", ""], null, {
        ...footer("{page}"),
        numberStyle: "i",
      }).number,
    ).toBe("");
    // from the number the first page starts at
    expect(endMark(0, empty, null, testLayout({ startNumber: 5 })).number).toBe(
      "5",
    );
    // a footer that reads a number that isn't the page's
    expect(
      endMark(1, ["", "", "", "", "Chapter 2", ""], null, footer("Chapter 2"))
        .number,
    ).toBe("2");
    // nor is a written {page}
    expect(endMark(1, empty, null, footer("{{page}")).number).toBe("2");
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

describe("viewAnchor and anchorTop", () => {
  // two pages of text in "page ends", with a mark of 64 px between them,
  // and the same two as sheets
  const ends: FrameLayout = {
    mode: "page-ends",
    scale: 2,
    frames: [
      {
        page: 0,
        top: 50,
        left: 0,
        width: 400,
        height: 600,
        x: 46,
        y: 70,
        w: 200,
        h: 300,
      },
      {
        page: 1,
        top: 714,
        left: 0,
        width: 400,
        height: 400,
        x: 46,
        y: 70,
        w: 200,
        h: 200,
      },
    ],
    height: 1200,
    headerRoom: 0,
  };
  const sheets: FrameLayout = {
    mode: "pages",
    scale: 1,
    frames: [
      {
        page: 0,
        top: 50,
        left: 0,
        width: 595,
        height: 842,
        x: 0,
        y: 0,
        w: 595,
        h: 842,
      },
      {
        page: 1,
        top: 916,
        left: 0,
        width: 595,
        height: 842,
        x: 0,
        y: 0,
        w: 595,
        h: 842,
      },
    ],
    height: 1800,
    headerRoom: 0,
  };

  it("finds the spot at the top of the view, and scrolls back to it", () => {
    // 100 px into the second page's text, 50 pt at 2 px per point
    const anchor = viewAnchor(ends, 814)!;
    expect(anchor).toEqual({ page: 1, y: 120 });
    expect(anchorTop(ends, anchor)).toBe(814);
    // on its sheet, 120 pt from its top edge
    expect(anchorTop(sheets, anchor)).toBe(916 + 120);
    expect(viewAnchor(sheets, 916 + 120)).toEqual(anchor);
  });

  it("takes the next page's top over the mark between the pages", () => {
    expect(viewAnchor(ends, 680)).toEqual({ page: 1, y: 70 });
    // above the first page the view shows the start, whatever the layout
    expect(viewAnchor(ends, 0)).toBeNull();
    expect(viewAnchor(ends, 50)).toBeNull();
    expect(viewAnchor(ends, 60)).toEqual({ page: 0, y: 75 });
    expect(viewAnchor(ends, 5000)).toBeNull();
  });

  it("goes to the text for a spot in a margin that page ends doesn't show", () => {
    expect(anchorTop(ends, { page: 1, y: 10 })).toBe(714);
    expect(anchorTop(ends, { page: 1, y: 800 })).toBe(714 + 400);
    expect(anchorTop(ends, { page: 7, y: 0 })).toBeNull();
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
  it("numbers the page as the pages are numbered", () => {
    expect(pageLabel({ page: 2, pages: 10 }, testLayout())).toBe(
      "Page 2 of 10",
    );
    expect(
      pageLabel({ page: 4, pages: 10 }, testLayout({ numberStyle: "i" })),
    ).toBe("Page iv of 10");
    // the first page counts from 5; "of" counts every page, as {pages} does
    expect(
      pageLabel({ page: 1, pages: 3 }, testLayout({ startNumber: 5 })),
    ).toBe("Page 5 of 3");
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
