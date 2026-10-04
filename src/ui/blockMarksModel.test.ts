import { describe, expect, it, vi } from "vitest";

import { blockBoxes, gapLine } from "../engine/geometry";
import { schema } from "../markdown";
import { doc, p } from "../test/editor";
import {
  contentBlockAt,
  dropLineOf,
  hoverBoxesOf,
  lineStyle,
  NO_BOXES,
  styleOf,
} from "./blockMarksModel";

vi.mock("../engine/geometry", () => ({
  blockBoxes: vi.fn(() => [{ page: 0, left: 1, top: 2, right: 3, bottom: 4 }]),
  gapLine: vi.fn(() => ({ left: 1, right: 9, y: 5 })),
}));

// "a", a table of contents at 3, "b"
const node = doc(p("a"), schema.node("toc"), p("b"));

describe("the marks of content blocks", () => {
  it("finds the content block at a position, and nothing elsewhere", () => {
    expect(contentBlockAt(node, 3)).toEqual({ from: 3, to: 4 });
    expect(contentBlockAt(node, 1)).toBeNull();
    expect(contentBlockAt(node, null)).toBeNull();
    expect(contentBlockAt(node, node.content.size)).toBeNull();
  });

  it("outlines the block under the pointer unless it is selected", () => {
    expect(hoverBoxesOf(node, { from: 3, to: 4 }, null)).toHaveLength(1);
    expect(blockBoxes).toHaveBeenCalledWith(3, 4);
    // none: the same empty array each time, which re-renders nothing
    expect(hoverBoxesOf(node, { from: 3, to: 4 }, { from: 3, to: 4 })).toBe(
      NO_BOXES,
    );
    expect(hoverBoxesOf(node, null, null)).toBe(NO_BOXES);
    // a block of a document that changed since
    expect(hoverBoxesOf(node, { from: 30, to: 40 }, null)).toBe(NO_BOXES);
  });

  it("shows the line of a drop only while a block is dragged", () => {
    expect(dropLineOf(node, null)).toBeNull();
    expect(dropLineOf(node, 99)).toBeNull();
    expect(dropLineOf(node, 3)).toEqual({ left: 1, right: 9, y: 5 });
    expect(gapLine).toHaveBeenCalledWith(node, 3);
  });

  it("styles the line of a drop, centered on its place", () => {
    expect(lineStyle({ left: 10, right: 110, y: 50 })).toEqual({
      left: "10px",
      top: "49px",
      width: "100px",
    });
  });

  it("styles a box of the window", () => {
    expect(styleOf({ left: 1, top: 2, right: 11, bottom: 7 })).toEqual({
      left: "1px",
      top: "2px",
      width: "10px",
      height: "5px",
    });
  });
});
