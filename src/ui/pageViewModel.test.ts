import { describe, expect, it } from "vitest";

import type { FrameLayout } from "../engine/frames";
import {
  endMark,
  firstHeaderPlace,
  propertiesPlace,
  scrollFor,
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
