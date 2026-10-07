import { describe, expect, it } from "vitest";

import { scrollFor, wheelPixels, zoomWheel } from "./scrollModel";

describe("scrollFor", () => {
  it("scrolls only as far as needed", () => {
    expect(scrollFor({ top: 300, height: 20 }, 0, 600)).toBeNull();
    expect(scrollFor({ top: 900, height: 20 }, 0, 600)).toBe(
      900 + 20 + 64 - 600,
    );
    // less room above, where the top area no longer covers the view
    expect(scrollFor({ top: 100, height: 20 }, 500, 600)).toBe(80);
  });
});

describe("wheelPixels", () => {
  it("turns lines and pages into pixels", () => {
    expect(wheelPixels({ deltaY: 30, deltaMode: 0 }, 600)).toBe(30);
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 }, 600)).toBe(48);
    expect(wheelPixels({ deltaY: 1, deltaMode: 2 }, 600)).toBe(600);
  });
});

describe("zoomWheel", () => {
  const wheel = (deltaY: number, timeStamp: number, deltaMode = 0) => ({
    deltaY,
    deltaMode,
    timeStamp,
  });

  it("zooms a step per notch of a wheel, up in and down out", () => {
    const steps: number[] = [];
    const turn = zoomWheel((direction) => steps.push(direction));
    turn(wheel(-100, 0));
    turn(wheel(-100, 10));
    turn(wheel(3, 20, 1));
    expect(steps).toEqual([1, 1, -1]);
  });

  it("adds a pinch's small turns up to a step", () => {
    const steps: number[] = [];
    const turn = zoomWheel((direction) => steps.push(direction));
    for (let i = 0; i < 4; i++) turn(wheel(-10, i * 10));
    expect(steps).toEqual([]);
    turn(wheel(-10, 50));
    expect(steps).toEqual([1]);
    // a new gesture after a rest starts from nothing
    turn(wheel(40, 100));
    turn(wheel(40, 400));
    expect(steps).toEqual([1]);
  });
});
