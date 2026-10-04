import { describe, expect, it } from "vitest";

import { iconNames, iconPath, iconStroke } from "./icons";

// how many numbers each path command takes
const ARGUMENTS: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

/**
 * points returns the points a path passes through and its control points, in
 * absolute coordinates: relative commands are added to where the pen is
 */
const points = (path: string) => {
  const result: [number, number][] = [];
  let [x, y, startX, startY] = [0, 0, 0, 0];
  for (const [, letter, args] of path.matchAll(/([a-z])([^a-z]*)/gi)) {
    const command = letter.toLowerCase();
    const relative = letter === command;
    const numbers = (args.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
    const size = ARGUMENTS[command];
    if (size === undefined) throw new Error(`unknown command ${letter}`);
    if (size === 0) {
      [x, y] = [startX, startY];
      continue;
    }
    for (let i = 0; i < numbers.length; i += size) {
      const group = numbers.slice(i, i + size);
      const [baseX, baseY] = relative ? [x, y] : [0, 0];
      if (command === "h") x = baseX + group[0];
      else if (command === "v") y = baseY + group[0];
      else if (command === "a") [x, y] = [baseX + group[5], baseY + group[6]];
      else {
        // the control points, then where it ends
        for (let j = 0; j < size - 2; j += 2) {
          result.push([baseX + group[j], baseY + group[j + 1]]);
        }
        [x, y] = [baseX + group[size - 2], baseY + group[size - 1]];
      }
      result.push([x, y]);
      // a move's further pairs are lines, and the subpath starts there
      if (command === "m" && i === 0) [startX, startY] = [x, y];
    }
  }
  return result;
};

describe("icons", () => {
  it("draws every icon", () => {
    for (const name of iconNames) expect(iconPath(name)).not.toBe("");
  });

  it("draws nothing for an unknown icon", () => {
    expect(iconPath("unknown")).toBe("");
  });

  it.each(iconNames)("keeps %s on the 24 grid", (name) => {
    for (const [x, y] of points(iconPath(name))) {
      expect([name, x >= 0 && x <= 24 && y >= 0 && y <= 24]).toEqual([
        name,
        true,
      ]);
    }
  });

  it("draws icons of dots with a heavier stroke", () => {
    expect(iconStroke("more")).toBe(2.5);
    expect(iconStroke("grip")).toBe(2.5);
    expect(iconStroke("bold")).toBe(1.5);
  });
});

describe("points", () => {
  it("follows relative commands from where the pen is", () => {
    expect(points("M4 4h2v3l-1 1z")).toEqual([
      [4, 4],
      [6, 4],
      [6, 7],
      [5, 8],
    ]);
  });
});
