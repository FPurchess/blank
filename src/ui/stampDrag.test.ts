import { describe, expect, it } from "vitest";

import { type Stamp, stampSpec } from "../pdf/stampModel";
import { DRAG_START, dragTo, sameRect, startDrag } from "./stampDrag";
import { stampBox, stampKeyAction, toolbarSpot } from "./stampOverlayModel";

const A4 = { width: 595, height: 842 };

const stamp: Stamp = {
  id: "s1",
  kind: "signature",
  page: 0,
  rect: [100, 100, 180, 60],
  natural: [180, 60],
  spec: stampSpec("signature"),
};

describe("dragging a stamp", () => {
  it("starts only once the pointer moved a few pixels", () => {
    const drag = startDrag(stamp, "move", 10, 10);
    const near = dragTo(drag, 10 + DRAG_START - 1, 10, 2, A4);
    expect(near.stamp).toBeNull();
    expect(near.drag.moving).toBe(false);
    const far = dragTo(drag, 10 + DRAG_START, 10, 2, A4);
    expect(far.drag.moving).toBe(true);
    // 4 px at 2 px per point
    expect(far.stamp?.rect).toEqual([102, 100, 180, 60]);
    // and goes on below the threshold once it started
    expect(dragTo(far.drag, 11, 10, 2, A4).stamp?.rect[0]).toBe(100.5);
  });

  it("keeps the stamp on its page", () => {
    const drag = startDrag(stamp, "move", 0, 0);
    expect(dragTo(drag, -10000, 0, 1, A4).stamp?.rect[0]).toBe(-170);
  });

  it("resizes from a corner, the opposite one staying, the shape kept", () => {
    const right = startDrag(stamp, "bottom-right", 0, 0);
    expect(dragTo(right, 90, 0, 1, A4).stamp?.rect).toEqual([
      100, 100, 270, 90,
    ]);
    // the way it went further: down 30 pt is 90 pt wider
    expect(dragTo(right, 10, 30, 1, A4).stamp?.rect).toEqual([
      100, 100, 270, 90,
    ]);
    const left = startDrag(stamp, "top-left", 0, 0);
    expect(dragTo(left, 90, 0, 1, A4).stamp?.rect).toEqual([190, 130, 90, 30]);
  });

  it("tells rects apart", () => {
    expect(sameRect([1, 2, 3, 4], [1, 2, 3, 4])).toBe(true);
    expect(sameRect([1, 2, 3, 4], [1, 2, 3, 5])).toBe(false);
  });
});

describe("a stamp on the desk", () => {
  const frame = {
    page: 0,
    top: 24,
    left: 50,
    width: 595,
    height: 842,
    x: 0,
    y: 0,
    w: 595,
    h: 842,
  };

  it("shows at its place on its page's frame", () => {
    expect(stampBox([10, 20, 30, 40], frame, 2)).toEqual({
      left: 70,
      top: 64,
      width: 60,
      height: 80,
    });
  });

  it("has its toolbar above it, or below it at the top", () => {
    expect(toolbarSpot({ left: 5, top: 100, width: 10, height: 10 })).toEqual({
      left: 5,
      top: 56,
    });
    expect(toolbarSpot({ left: 5, top: 20, width: 10, height: 10 })).toEqual({
      left: 5,
      top: 38,
    });
  });
});

describe("the keys of a selected stamp", () => {
  const key = (key: string, mods: Partial<KeyboardEvent> = {}) =>
    stampKeyAction({
      key,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      ...mods,
    });

  it("nudge with the arrows, further with Shift", () => {
    expect(key("ArrowLeft")).toEqual({ kind: "nudge", dx: -1, dy: 0 });
    expect(key("ArrowDown", { shiftKey: true })).toEqual({
      kind: "nudge",
      dx: 0,
      dy: 10,
    });
  });

  it("resize with Alt and the arrows", () => {
    expect(key("ArrowRight", { altKey: true })).toEqual({
      kind: "resize",
      by: 1,
    });
    expect(key("ArrowUp", { altKey: true, shiftKey: true })).toEqual({
      kind: "resize",
      by: 10,
    });
    expect(key("ArrowDown", { altKey: true })).toEqual({
      kind: "resize",
      by: -1,
    });
  });

  it("remove, deselect, and leave the rest to the page view", () => {
    expect(key("Delete")).toEqual({ kind: "remove" });
    expect(key("Backspace")).toEqual({ kind: "remove" });
    expect(key("Escape")).toEqual({ kind: "deselect" });
    expect(key("z", { ctrlKey: true })).toBeNull();
    expect(key("ArrowLeft", { metaKey: true })).toBeNull();
    expect(key("Tab")).toBeNull();
    expect(key("Delete", { shiftKey: true })).toBeNull();
    expect(key("x", { altKey: true })).toBeNull();
  });
});
