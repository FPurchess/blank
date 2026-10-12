import { describe, expect, it } from "vitest";

import {
  bookOf,
  changed,
  clampRect,
  defaultSpot,
  EMPTY_BOOK,
  fitInto,
  ghostsOf,
  HISTORY,
  isStamp,
  markSize,
  moveTo,
  nudge,
  onPages,
  readingOrder,
  redone,
  resizeBy,
  resizeTo,
  scaledSpec,
  spotAt,
  type Stamp,
  stampLabel,
  stampSpec,
  toggleRepeat,
  undone,
  withoutStamp,
  withStamp,
} from "./stampModel";

const A4 = { width: 595, height: 842 };
const A5 = { width: 420, height: 595 };

const stamp = (over: Partial<Stamp> = {}): Stamp => ({
  id: "s1",
  kind: "signature",
  page: 0,
  rect: [100, 100, 180, 60],
  natural: [180, 60],
  spec: stampSpec("signature"),
  ...over,
});

describe("placing and moving", () => {
  it("keeps at least 10 pt of a stamp on its page", () => {
    expect(clampRect([-500, 900, 180, 60], A4)).toEqual([-170, 832, 180, 60]);
    expect(clampRect([590, -100, 180, 60], A4)).toEqual([585, -50, 180, 60]);
    expect(clampRect([100, 100, 180, 60], A4)).toEqual([100, 100, 180, 60]);
  });

  it("nudges by the points asked, kept on the page", () => {
    expect(nudge(stamp(), 1, 0, A4).rect).toEqual([101, 100, 180, 60]);
    expect(nudge(stamp(), 0, -10, A4).rect).toEqual([100, 90, 180, 60]);
    expect(nudge(stamp(), -1000, 0, A4).rect[0]).toBe(-170);
  });

  it("moves a stamp's top left to a point", () => {
    expect(moveTo(stamp(), 20, 30, A4).rect).toEqual([20, 30, 180, 60]);
  });

  it("centres a stamp placed by a click on the click", () => {
    expect(spotAt([180, 60], 300, 400, A4)).toEqual([210, 370, 180, 60]);
  });

  it("adds, replaces and removes stamps by id", () => {
    const one = stamp();
    const two = stamp({ id: "s2" });
    expect(withStamp([one], two)).toEqual([one, two]);
    const moved = { ...one, rect: [0, 0, 180, 60] as Stamp["rect"] };
    expect(withStamp([one, two], moved)).toEqual([moved, two]);
    expect(withoutStamp([one, two], "s1")).toEqual([two]);
  });

  it("puts stamps in reading order", () => {
    const low = stamp({ id: "low", rect: [10, 500, 10, 10] });
    const right = stamp({ id: "right", rect: [300, 100, 10, 10] });
    const left = stamp({ id: "left", rect: [10, 100, 10, 10] });
    const next = stamp({ id: "next", page: 1, rect: [0, 0, 10, 10] });
    expect(readingOrder([next, low, right, left]).map((s) => s.id)).toEqual([
      "left",
      "right",
      "low",
      "next",
    ]);
  });
});

describe("resizing", () => {
  it("keeps the aspect and the top left", () => {
    expect(resizeBy(stamp(), 10, A4).rect).toEqual([100, 100, 190, 190 / 3]);
    expect(resizeBy(stamp(), -1, A4).rect).toEqual([100, 100, 179, 179 / 3]);
  });

  it("stays within 50 % and 300 % of the natural size", () => {
    expect(resizeBy(stamp(), -1000, A4).rect).toEqual([100, 100, 90, 30]);
    expect(resizeBy(stamp(), 1000, A4).rect).toEqual([100, 100, 540, 180]);
  });

  it("keeps the opposite corner of a handle where it was", () => {
    // dragging the top left corner leaves the bottom right
    expect(resizeTo(stamp(), 360, A4, "bottom-right").rect).toEqual([
      -80, 40, 360, 120,
    ]);
    expect(resizeTo(stamp(), 90, A4, "bottom-left").rect).toEqual([
      100, 130, 90, 30,
    ]);
    expect(resizeTo(stamp(), 90, A4, "top-right").rect).toEqual([
      190, 100, 90, 30,
    ]);
  });

  it("scales the lines' letters with the stamp", () => {
    const date = stamp({
      kind: "date",
      spec: stampSpec("date", "12 October 2026"),
      natural: [100, 14],
      rect: [0, 0, 200, 28],
    });
    expect(scaledSpec(date).size).toBe(22);
    expect(scaledSpec(date).lines).toEqual(["12 October 2026"]);
  });

  it("contains a signature's picture in its box", () => {
    expect(markSize("signature", 600, 100)).toEqual([180, 30]);
    expect(markSize("initials", 100, 100)).toEqual([28, 28]);
    expect(markSize("signature", 0, 0)).toEqual([180, 60]);
  });
});

describe("repeated initials", () => {
  const initials = stamp({
    id: "i",
    kind: "initials",
    rect: [500, 780, 56, 28],
    natural: [56, 28],
  });

  it("repeat only initials", () => {
    expect(toggleRepeat([initials], "i")[0].repeat).toBe(true);
    expect(toggleRepeat(toggleRepeat([initials], "i"), "i")[0].repeat).toBe(
      false,
    );
    expect(toggleRepeat([stamp()], "s1")[0].repeat).toBeUndefined();
  });

  it("show on the other pages, as far from the nearer edges", () => {
    const ghosts = ghostsOf([{ ...initials, repeat: true }], [A4, A4, A5]);
    expect(ghosts.map((ghost) => ghost.page)).toEqual([1, 2]);
    expect(ghosts[0].rect).toEqual([500, 780, 56, 28]);
    // 39 pt from the right edge and 34 pt from the bottom, as on A4
    expect(ghosts[1].rect).toEqual([325, 533, 56, 28]);
    expect(ghostsOf([initials], [A4, A4])).toEqual([]);
  });

  it("fit made smaller into a page smaller than them", () => {
    expect(
      fitInto(
        [0, 0, 200, 100],
        { width: 300, height: 300 },
        { width: 100, height: 100 },
      ),
    ).toEqual([0, 0, 100, 50]);
  });
});

describe("default spots", () => {
  const shown = { top: 0, height: 842 };

  it("puts a signature in the lower third of what shows, centred", () => {
    expect(defaultSpot("signature", [180, 60], 0, [A4], shown, [])).toEqual({
      page: 0,
      rect: [207.5, 2 * (842 / 3) + (842 / 3 - 60) / 2, 180, 60],
    });
    const part = { top: 400, height: 300 };
    expect(defaultSpot("signature", [180, 60], 0, [A4], part, []).rect[1]).toBe(
      400 + 200 + 20,
    );
  });

  it("puts initials at the bottom right", () => {
    expect(defaultSpot("initials", [56, 28], 0, [A4], shown, [])).toEqual({
      page: 0,
      rect: [595 - 56 - 36, 842 - 28 - 36, 56, 28],
    });
  });

  it("puts a date and a place below the last signature", () => {
    const signature = stamp({ page: 1, rect: [50, 600, 180, 60] });
    const date = defaultSpot("date", [90, 14], 0, [A4, A4], shown, [
      stamp({ id: "first" }),
      signature,
    ]);
    expect(date).toEqual({ page: 1, rect: [50, 666, 90, 14] });
    const placed = stamp({ id: "d", kind: "date", ...date });
    const place = defaultSpot("place", [60, 14], 0, [A4, A4], shown, [
      signature,
      placed,
    ]);
    expect(place).toEqual({ page: 1, rect: [50, 686, 60, 14] });
  });

  it("puts a date like a signature when there's none", () => {
    expect(defaultSpot("date", [90, 14], 0, [A4], shown, []).rect[0]).toBe(
      (595 - 90) / 2,
    );
  });
});

describe("the history", () => {
  const one = [stamp()];
  const two = [stamp({ id: "s2" })];

  it("undoes and redoes whole steps", () => {
    const book = changed(changed(EMPTY_BOOK, one), two);
    expect(undone(book).stamps).toBe(one);
    expect(undone(undone(book)).stamps).toEqual([]);
    expect(undone(undone(undone(book))).stamps).toEqual([]);
    expect(redone(undone(book)).stamps).toBe(two);
    expect(redone(book)).toBe(book);
  });

  it("forgets what was undone once something else changes", () => {
    const book = changed(undone(changed(changed(EMPTY_BOOK, one), two)), two);
    expect(book.future).toEqual([]);
  });

  it("makes nudges of one stamp in quick succession one step", () => {
    let book = changed(EMPTY_BOOK, one);
    book = changed(book, [stamp({ rect: [101, 100, 180, 60] })], {
      id: "s1",
      at: 1000,
    });
    book = changed(book, [stamp({ rect: [102, 100, 180, 60] })], {
      id: "s1",
      at: 1400,
    });
    expect(undone(book).stamps).toBe(one);
    // a pause starts a new step
    book = changed(book, [stamp({ rect: [103, 100, 180, 60] })], {
      id: "s1",
      at: 2000,
    });
    expect(undone(book).stamps[0].rect[0]).toBe(102);
  });

  it("keeps at most a hundred steps", () => {
    let book = EMPTY_BOOK;
    for (let i = 0; i < HISTORY + 20; i++) book = changed(book, [stamp()]);
    expect(book.past.length).toBe(HISTORY);
  });

  it("starts restored stamps with no history", () => {
    expect(bookOf(one)).toEqual({ ...EMPTY_BOOK, stamps: one });
  });
});

describe("what is stored", () => {
  it("keeps the stamps on the pages a PDF has", () => {
    expect(onPages([stamp(), stamp({ id: "far", page: 3 })], 2)).toEqual([
      stamp(),
    ]);
  });

  it("tells a stamp from what isn't one", () => {
    expect(isStamp(JSON.parse(JSON.stringify(stamp())))).toBe(true);
    expect(isStamp({ ...stamp(), kind: "seal" })).toBe(false);
    expect(isStamp({ ...stamp(), rect: [1, 2, 3] })).toBe(false);
    expect(isStamp(null)).toBe(false);
  });

  it("names a stamp for screen readers", () => {
    expect(stampLabel(stamp({ page: 1 }), true)).toBe(
      "Signature on page 2, selected",
    );
    expect(stampLabel(stamp({ kind: "initials", repeat: true }), false)).toBe(
      "Initials on page 1 and every other page",
    );
  });
});
