import { describe, expect, it } from "vitest";

import type { PageLayoutState } from "../state";
import { BLOCKS_DOCK, blocksDock } from "./blocksPaneModel";
import {
  freeRight,
  layoutWidth,
  listShape,
  OUTLINE_DOCK,
  outlinePlacement,
} from "./outlineModel";

// A4 with margins of 2.5 cm, in points
const margin = (2.5 * 72) / 2.54;
const a4: PageLayoutState = {
  width: 595.28,
  height: 841.89,
  margins: { top: margin, right: margin, bottom: margin, left: margin },
  pages: 2,
  bodyVersions: new Uint32Array([1, 1]),
  bandVersions: new Uint32Array([1, 1]),
  bottoms: new Float32Array([700, 300]),
};
const letter: PageLayoutState = { ...a4, width: 612, height: 792 };

describe("freeRight", () => {
  it("is the room right of the sheets in Pages", () => {
    // an A4 sheet is 794 px wide at 96 dpi, centred
    expect(freeRight(1400, a4, "pages", false)).toBeCloseTo(303, 0);
    expect(freeRight(1100, a4, "pages", false)).toBeCloseTo(153, 0);
    expect(freeRight(1400, letter, "pages", false)).toBeCloseTo(292, 0);
  });

  it("is the room right of the column in Page ends", () => {
    // A4's text and the room beside it for list markers is 821 px wide
    expect(freeRight(1000, a4, "page-ends", false)).toBeCloseTo(90, 0);
    expect(freeRight(1400, a4, "page-ends", false)).toBeCloseTo(290, 0);
  });

  it("is none on a window narrower than the pages", () => {
    expect(freeRight(800, a4, "pages", false)).toBeLessThan(OUTLINE_DOCK);
    expect(freeRight(800, a4, "pages", false)).toBeGreaterThanOrEqual(0);
  });

  it("is none before anything is laid out", () => {
    expect(freeRight(1400, null, "pages", false)).toBe(0);
    expect(freeRight(1400, { ...a4, pages: 0 }, "pages", false)).toBe(0);
  });

  it("is what the editor leaves without the engine", () => {
    expect(freeRight(1000, null, "pages", true)).toBe(0);
    expect(freeRight(1600, null, "pages", true)).toBe(400);
  });
});

describe("outlinePlacement", () => {
  it("hides with fewer than two headings", () => {
    expect(outlinePlacement(0, true, 1400, 500)).toBe("hidden");
    expect(outlinePlacement(1, false, 800, 0)).toBe("hidden");
  });

  it("shows the dashes while it isn't kept open", () => {
    expect(outlinePlacement(2, false, 1400, 500)).toBe("dashes");
  });

  it("shows the dashes on a narrow window even when kept open", () => {
    expect(outlinePlacement(2, true, 800, 0)).toBe("dashes");
    expect(outlinePlacement(2, true, 999, 0)).toBe("dashes");
  });

  it("lies beside the pages where there is room, and docks where there isn't", () => {
    expect(outlinePlacement(2, true, 1000, OUTLINE_DOCK)).toBe("beside");
    expect(outlinePlacement(2, true, 1000, OUTLINE_DOCK - 1)).toBe("docked");
  });
});

describe("the outline beside the blocks pane", () => {
  // where the outline shows with an A4 page, two headings and the outline
  // kept open, with the blocks pane open or not
  const placeAt = (windowWidth: number, paneOpen: boolean) =>
    outlinePlacement(
      2,
      true,
      windowWidth,
      freeRight(
        layoutWidth(windowWidth, 0, blocksDock(paneOpen, windowWidth)),
        a4,
        "pages",
        false,
      ),
    );

  it("counts the room the docked pane takes off the pages' width", () => {
    expect(layoutWidth(1600, 15, BLOCKS_DOCK)).toBe(1600 - 15 - 248);
    expect(blocksDock(true, 1000)).toBe(BLOCKS_DOCK);
    expect(blocksDock(true, 999)).toBe(0);
    expect(blocksDock(false, 1600)).toBe(0);
  });

  it("docks where the pane leaves too little room beside the pages", () => {
    expect([1000, 1280, 1600].map((width) => placeAt(width, false))).toEqual([
      "docked",
      "docked",
      "beside",
    ]);
    expect([1000, 1280, 1600].map((width) => placeAt(width, true))).toEqual([
      "docked",
      "docked",
      "docked",
    ]);
  });

  it("lies beside the pages once there is room for both", () => {
    expect(placeAt(1900, true)).toBe("beside");
  });
});

describe("listShape", () => {
  it("shows the open list as a side pane, the rest over the pages", () => {
    expect(listShape(true, null)).toBe("open");
    // a peek left over from before it opened doesn't change that
    expect(listShape(true, "hover")).toBe("open");
    expect(listShape(false, "sticky")).toBe("floating");
    expect(listShape(false, "hover")).toBe("peek");
  });
});
