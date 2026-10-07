import { describe, expect, it } from "vitest";

import type { PageLayoutState } from "../state";
import {
  anchorTop,
  type FrameLayout,
  BLEED,
  frameLayout,
  frameNear,
  FOOTER_ROOM,
  HEADER_ROOM,
  MARK_HEIGHT,
  onDesk,
  pointOnPage,
  SHEET_GAP,
  SHEET_SCALE,
  sheetScale,
  TEXT_SCALE,
  VIEW_BOTTOM,
  VIEW_TOP,
  visibleFrames,
  visibleRange,
  keptRange,
  viewAnchor,
} from "./frames";

const margin = 72;
const layout: PageLayoutState = {
  width: 600,
  height: 800,
  margins: { top: margin, right: margin, bottom: margin, left: margin },
  pages: 3,
  bodyVersions: new Uint32Array([1, 2, 3]),
  bandVersions: new Uint32Array([1, 2, 3]),
  bottoms: new Float32Array([700, 400, 0]),
};

describe("frameLayout", () => {
  it("shows the pages at a zoom, in both views, as wide as the desk needs", () => {
    const zoomed = frameLayout(layout, "pages", 648, 1.5);
    expect(zoomed.scale).toBe(1.5 * SHEET_SCALE);
    // the sheet and the room beside it are wider than the view
    expect(zoomed.width).toBe(Math.ceil(600 * 1.5 * SHEET_SCALE + 48));
    expect(zoomed.frames[0].left).toBe(24);
    expect(frameLayout(layout, "page-ends", 648, 0.5).scale).toBe(
      0.5 * SHEET_SCALE,
    );
    // Fit leaves the desk as wide as the view
    expect(frameLayout(layout, "pages", 648).width).toBe(648);
  });

  it("fits page ends at the editor's text size at most", () => {
    expect(frameLayout(layout, "page-ends", 4000).scale).toBe(TEXT_SCALE);
    expect(sheetScale("page-ends", 500, 4000, "fit")).toBe(TEXT_SCALE);
    expect(sheetScale("pages", 500, 4000, "fit")).toBe(SHEET_SCALE);
  });

  it("places whole sheets one below the other", () => {
    const placed = frameLayout(layout, "pages", 648);
    expect(placed.scale).toBe(1);
    expect(placed.frames[1]).toMatchObject({
      page: 1,
      top: VIEW_TOP + 800 + SHEET_GAP,
      left: 24,
      x: 0,
      y: 0,
      w: 600,
      h: 800,
    });
    // a narrow window shrinks them, to half the size they print at
    expect(frameLayout(layout, "pages", 498).scale).toBe(0.75);
    expect(frameLayout(layout, "pages", 348).scale).toBe(SHEET_SCALE / 2);
  });

  it("places the text of each page, as long as it is, with marks between", () => {
    const placed = frameLayout(layout, "page-ends", 2000);
    expect(placed.scale).toBe(TEXT_SCALE);
    const [first, second, third] = placed.frames;
    expect(first).toMatchObject({
      x: margin - BLEED,
      y: margin,
      h: 700 - margin,
    });
    expect(second.top).toBeCloseTo(first.top + first.height + MARK_HEIGHT);
    // an empty page still takes a line
    expect(third.h).toBe(16);
  });

  it("maps between the desk and the pages", () => {
    const placed = frameLayout(layout, "pages", 648);
    const second = placed.frames[1];
    expect(pointOnPage(placed, second.left + 100, second.top + 50)).toEqual({
      page: 1,
      x: 100,
      y: 50,
    });
    // between two sheets: the nearest one
    expect(frameNear(placed, second.top - 5)?.page).toBe(1);
    expect(
      onDesk(placed, { page: 1, x: 100, y: 50, width: 10, height: 20 }),
    ).toEqual({
      left: second.left + 100,
      top: second.top + 50,
      width: 10,
      height: 20,
    });
    expect(
      onDesk(placed, { page: 9, x: 0, y: 0, width: 0, height: 0 }),
    ).toBeNull();
    expect(pointOnPage({ ...placed, frames: [] }, 0, 0)).toBeNull();
  });

  it("shows only the frames near the view", () => {
    const placed = frameLayout(layout, "pages", 648);
    expect(visibleFrames(placed, 0, 600, 0).map((frame) => frame.page)).toEqual(
      [0],
    );
    expect(
      visibleFrames(placed, 800, 600, 0).map((frame) => frame.page),
    ).toEqual([0, 1]);
  });
});

describe("visibleRange", () => {
  it("names the pages near the view, the same while they stay", () => {
    const state = {
      width: 600,
      height: 800,
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
      pages: 10,
      bodyVersions: new Uint32Array(10),
      bandVersions: new Uint32Array(10),
      bottoms: new Float32Array(10).fill(700),
    };
    const layout = frameLayout(state, "pages", 800);
    const sheet = layout.frames[1].top - layout.frames[0].top;
    // the last 32 px of the third page and the top of the fourth
    const top = layout.frames[3].top - SHEET_GAP - 32;
    expect(visibleRange(layout, 0, 600, 0)).toBe("0-0");
    expect(visibleRange(layout, 10, 600, 0)).toBe("0-0");
    expect(visibleRange(layout, top, 600, 0)).toBe("2-3");
    // with the room around the view
    expect(visibleRange(layout, top, 600)).toBe("2-4");
    expect(visibleRange(layout, sheet * 100, 600, 0)).toBe("");
  });
});

describe("keptRange", () => {
  it("keeps the pages shown before while they are within reach", () => {
    expect(keptRange("", "2-4", "1-5")).toBe("2-4");
    // moving down by a page: page 2 stays, as it's still near enough
    expect(keptRange("2-4", "3-5", "2-6")).toBe("2-5");
    // far away: only what is near
    expect(keptRange("2-5", "9-11", "8-12")).toBe("9-11");
    expect(keptRange("2-5", "", "")).toBe("");
  });
});

describe("the room for the first page's header", () => {
  const tops = (placed: ReturnType<typeof frameLayout>) =>
    placed.frames.map((frame) => frame.top);

  it("is kept in page ends also without a header, for adding one", () => {
    const placed = frameLayout(layout, "page-ends", 800);
    expect(placed.headerRoom).toBe(0);
    expect(placed.frames[0].top).toBe(VIEW_TOP + HEADER_ROOM);
  });

  it("leaves the frames where they are when a header comes in page ends", () => {
    const without = frameLayout(layout, "page-ends", 800);
    const placed = frameLayout({ ...layout, header: true }, "page-ends", 800);
    expect(placed.headerRoom).toBe(HEADER_ROOM);
    expect(tops(placed)).toEqual(tops(without));
    expect(placed.height).toBe(without.height);
  });

  it("is none on sheets, which show their headers", () => {
    const without = frameLayout(layout, "pages", 800);
    const placed = frameLayout({ ...layout, header: true }, "pages", 800);
    expect(placed.headerRoom).toBe(0);
    expect(tops(placed)).toEqual(tops(without));
  });
});

describe("the room for the last page's footer", () => {
  const tops = (placed: ReturnType<typeof frameLayout>) =>
    placed.frames.map((frame) => frame.top);
  const bottom = (placed: ReturnType<typeof frameLayout>) => {
    const last = placed.frames[placed.frames.length - 1];
    return last.top + last.height;
  };

  it("is none without a footer: the desk ends a little below the text", () => {
    const placed = frameLayout(layout, "page-ends", 800);
    expect(placed.footerRoom).toBe(0);
    expect(Math.round(placed.height)).toBe(bottom(placed) + VIEW_BOTTOM);
  });

  it("makes the desk taller below the last page, moving no page", () => {
    const without = frameLayout(layout, "page-ends", 800);
    const placed = frameLayout({ ...layout, footer: true }, "page-ends", 800);
    expect(placed.footerRoom).toBe(FOOTER_ROOM);
    expect(tops(placed)).toEqual(tops(without));
    expect(Math.round(placed.height)).toBe(
      bottom(placed) + FOOTER_ROOM + VIEW_BOTTOM,
    );
  });

  it("keeps a one-page document's room as tall as the footer", () => {
    const one = { ...layout, pages: 1, footer: true };
    const placed = frameLayout(one, "page-ends", 800);
    expect(placed.frames).toHaveLength(1);
    expect(Math.round(placed.height)).toBe(
      bottom(placed) + FOOTER_ROOM + VIEW_BOTTOM,
    );
  });

  it("is none on sheets, which show their footers", () => {
    const without = frameLayout(layout, "pages", 800);
    const placed = frameLayout({ ...layout, footer: true }, "pages", 800);
    expect(placed.footerRoom).toBe(0);
    expect(placed.height).toBe(without.height);
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
    width: 800,
    height: 1200,
    headerRoom: 0,
    footerRoom: 0,
  };
  const sheets: FrameLayout = {
    mode: "pages",
    scale: 1,
    width: 800,
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
    footerRoom: 0,
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
