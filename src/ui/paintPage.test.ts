import { describe, expect, it, vi } from "vitest";

import { paintPage } from "./paintPage";

// a context that records what is painted
const recorder = () => {
  const calls: unknown[][] = [];
  const context = {
    canvas: { width: 200, height: 100 },
    globalAlpha: 1,
    fillStyle: "",
    setTransform: (...args: number[]) => calls.push(["transform", ...args]),
    clearRect: vi.fn(),
    fillRect: (...args: number[]) => calls.push(["rect", ...args]),
    drawImage: (_: unknown, ...args: number[]) =>
      calls.push(["image", ...args]),
    fill: (path: unknown) => calls.push(["fill", path]),
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls };
};

describe("paintPage", () => {
  it("paints glyphs, rectangles and images where the layout put them", () => {
    const { context, calls } = recorder();
    const glyph = vi.fn(
      (font: number, id: number) => `${font}:${id}` as unknown as Path2D,
    );
    paintPage(
      context,
      {
        r: [[10, 20, 30, 0.1, 0]],
        i: [["a.png", 0, 0, 5, 5]],
        l: [],
        g: [[0, 10, 0, 42, 12, 30, 43, 18, 30]],
      },
      {
        scale: 2,
        ratio: 1,
        x: 10,
        y: 10,
        color: "black",
        glyph,
        unitsPerEm: () => 1000,
        image: () => ({}) as CanvasImageSource,
      },
    );
    // a hairline stays a pixel thick
    expect(calls).toContainEqual(["rect", 0, 20, 60, 1]);
    expect(calls).toContainEqual(["image", -20, -20, 10, 10]);
    // each glyph: one em of 10 pt at 2 px per point, y up, at its spot
    expect(calls).toContainEqual(["transform", 0.02, 0, 0, -0.02, 4, 40]);
    expect(calls).toContainEqual(["transform", 0.02, 0, 0, -0.02, 16, 40]);
    expect(glyph).toHaveBeenCalledWith(0, 43);
  });
});
