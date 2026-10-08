import { describe, expect, it } from "vitest";

import { drawStrokes, PAD_HEIGHT, PAD_WIDTH, type Pen, toPad } from "./pad";

// a pen that writes down what it draws
const recorder = () => {
  const calls: string[] = [];
  const pen = new Proxy({} as Pen, {
    get:
      (_, name: string) =>
      (...args: number[]) =>
        calls.push(`${name}(${args.map((n) => Math.round(n)).join(",")})`),
    set: (_, name: string, value: unknown) => {
      calls.push(
        `${name}=${typeof value === "number" ? value.toFixed(1) : String(value)}`,
      );
      return true;
    },
  });
  return { pen, calls };
};

describe("the signature pad", () => {
  it("keeps its strokes in its own units, whatever its size on the screen", () => {
    expect(toPad(250, 75, 0.8, 500, 150)).toEqual([
      PAD_WIDTH / 2,
      PAD_HEIGHT / 2,
      0.8,
    ]);
    expect(toPad(10, 10, 0, 0, 0)).toEqual([
      10 * PAD_WIDTH,
      10 * PAD_HEIGHT,
      0.5,
    ]);
  });

  it("draws a mouse at the middle pressure, and a pen heavier as it presses", () => {
    expect(toPad(0, 0, 0, 1, 1)[2]).toBe(0.5);
    expect(toPad(0, 0, 1.5, 1, 1)[2]).toBe(0.5);
    const widthOf = (pressure: number) => {
      const { pen, calls } = recorder();
      drawStrokes(
        pen,
        [
          [
            [0, 0, pressure],
            [10, 0, pressure],
          ],
        ],
        1,
        "#000",
      );
      return Number(
        calls.find((call) => call.startsWith("lineWidth="))!.slice(10),
      );
    };
    expect(widthOf(1)).toBeGreaterThan(widthOf(0.1));
  });

  it("draws a stroke as curves, and a single point as a dot", () => {
    const { pen, calls } = recorder();
    const count = (name: string) =>
      calls.filter((call) => call.startsWith(`${name}(`)).length;
    drawStrokes(
      pen,
      [
        [
          [0, 0, 0.5],
          [10, 0, 0.5],
          [20, 10, 0.5],
        ],
      ],
      2,
      "#000",
    );
    // the first segment straight, the next curved through the point
    expect([count("lineTo"), count("quadraticCurveTo"), count("arc")]).toEqual([
      1, 1, 0,
    ]);
    calls.length = 0;
    drawStrokes(pen, [[[5, 5, 0.5]]], 2, "#000");
    expect([count("lineTo"), count("quadraticCurveTo"), count("arc")]).toEqual([
      0, 0, 1,
    ]);
  });
});
