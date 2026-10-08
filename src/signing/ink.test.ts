import { describe, expect, it } from "vitest";

import { inkBox, otsu, removeBackground, trim } from "./ink";

// a picture of `width` by `height` grey pixels, `ink` dark ones among them
const picture = (
  width: number,
  height: number,
  ink: [number, number][],
  paper = 235,
) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++)
    data.set([paper, paper, paper, 255], i * 4);
  for (const [x, y] of ink) data.set([20, 30, 90, 255], (y * width + x) * 4);
  return { data, width, height };
};

const alphaAt = (
  pixels: { data: Uint8ClampedArray; width: number },
  x: number,
  y: number,
) => pixels.data[(y * pixels.width + x) * 4 + 3];

describe("the ink of a signature's picture", () => {
  it("splits ink from paper", () => {
    const { ink, paper } = otsu(
      picture(10, 10, [
        [2, 2],
        [3, 3],
      ]),
    );
    expect(ink).toBeCloseTo(34, 0);
    expect(paper).toBe(235);
  });

  it("makes the paper transparent and keeps the ink", () => {
    const clean = removeBackground(
      picture(10, 10, [
        [2, 2],
        [3, 3],
      ]),
    );
    expect(alphaAt(clean, 0, 0)).toBe(0);
    expect(alphaAt(clean, 2, 2)).toBe(255);
  });

  it("trims to the ink, with a margin", () => {
    const clean = removeBackground(
      picture(20, 20, [
        [5, 6],
        [9, 8],
      ]),
    );
    expect(inkBox(clean)).toEqual({ x: 5, y: 6, width: 5, height: 3 });
    const trimmed = trim(clean, 2)!;
    expect([trimmed.width, trimmed.height]).toEqual([9, 7]);
    expect(alphaAt(trimmed, 2, 2)).toBe(255);
  });

  it("finds no ink on empty paper", () => {
    expect(trim(removeBackground(picture(5, 5, [])))).toBeNull();
  });
});
