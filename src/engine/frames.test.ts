import { describe, expect, it } from "vitest";

import type { PageLayoutState } from "../state";
import {
  BLEED,
  frameLayout,
  frameNear,
  MARK_HEIGHT,
  onDesk,
  pointOnPage,
  SHEET_GAP,
  TEXT_SCALE,
  VIEW_TOP,
  visibleFrames,
  visibleRange,
  keptRange,
} from "./frames";

const margin = 72;
const layout: PageLayoutState = {
  width: 600,
  height: 800,
  margins: { top: margin, right: margin, bottom: margin, left: margin },
  pages: 3,
  versions: new Uint32Array([1, 2, 3]),
  bottoms: new Float32Array([700, 400, 0]),
};

describe("frameLayout", () => {
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
    // a narrow window shrinks them
    expect(frameLayout(layout, "pages", 348).scale).toBe(0.5);
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
      versions: new Uint32Array(10),
      bottoms: new Float32Array(10).fill(700),
    };
    const layout = frameLayout(state, "pages", 800);
    const sheet = layout.frames[1].top - layout.frames[0].top;
    expect(visibleRange(layout, 0, 600, 0)).toBe("0-0");
    expect(visibleRange(layout, 10, 600, 0)).toBe("0-0");
    expect(visibleRange(layout, sheet * 3, 600, 0)).toBe("2-3");
    // with the room around the view
    expect(visibleRange(layout, sheet * 3, 600)).toBe("2-4");
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
