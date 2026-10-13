import { describe, expect, it } from "vitest";

import { schema } from "../schema";
import { capsOf, parseWidth, widthChoice, widthOf } from "./caps";

describe("block capabilities", () => {
  it("says what a kind of block can do", () => {
    expect(capsOf(schema.nodes.diagram)).toEqual({ align: true, width: true });
    expect(capsOf(schema.nodes.image)).toEqual({ width: true });
    expect(capsOf(schema.nodes.toc)).toEqual({});
  });

  it.each([
    ["50%", { share: 0.5 }],
    ["150%", { share: 1 }],
    ["300", { points: 225 }],
    ["300px", { points: 225 }],
    ["72pt", { points: 72 }],
    ["", null],
    ["0%", null],
    ["wide", null],
    [null, null],
  ])("reads the width %j", (value, width) => {
    expect(parseWidth(value)).toEqual(width);
  });

  it("offers Fit and shares, and none for another file's width", () => {
    expect(widthChoice(null)).toBe("fit");
    expect(widthChoice("75%")).toBe("75%");
    expect(widthChoice("300")).toBeNull();
    expect(widthOf("fit")).toBeNull();
    expect(widthOf("50%")).toBe("50%");
  });
});
