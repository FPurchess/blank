import { describe, expect, it } from "vitest";

import type { FrameLayout } from "../engine/frames";
import {
  anchorTop,
  endMark,
  firstHeaderPlace,
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
  it("shows the footer, the number without one, and the next header", () => {
    const bands = ["T", "", "", "", "2 of 5", ""];
    expect(endMark(1, bands, ["Next", "", "", "", "", ""])).toEqual({
      footer: ["", "2 of 5", ""],
      number: "",
      header: ["Next", "", ""],
    });
    expect(endMark(1, ["", "", "", "", "", ""], null)).toMatchObject({
      number: "2",
      header: ["", "", ""],
    });
  });
});

describe("firstHeaderPlace", () => {
  it("puts the first page's header right above its text in page ends", () => {
    // the frame shows 24 pt beside the text
    expect(firstHeaderPlace(pageEnds)).toEqual({
      left: 76,
      top: 80,
      width: 528,
      height: 20,
    });
    // in the room the layout keeps for it
    expect(
      firstHeaderPlace({ ...pageEnds, headerRoom: 22 } as FrameLayout),
    ).toMatchObject({ top: 78, height: 22 });
  });

  it("leaves the header to the sheets in pages", () => {
    expect(firstHeaderPlace(pages)).toBeNull();
    expect(firstHeaderPlace({ ...pageEnds, frames: [] })).toBeNull();
  });
});

describe("propertiesPlace", () => {
  it("puts the properties above the first page and its header", () => {
    expect(propertiesPlace(pages)).toEqual({ left: 40, top: 68, width: 600 });
    expect(
      propertiesPlace({ ...pageEnds, headerRoom: 20 } as FrameLayout),
    ).toEqual({ left: 76, top: 48, width: 528 });
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
