import { describe, expect, it, vi } from "vitest";

import { place, placeTip, placeToolbar } from "./popup";

// jsdom's window is 1024 × 768
const toolbar = (width = 200, height = 30) => {
  const element = document.createElement("div");
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    width,
    height,
  } as DOMRect);
  return element;
};

const table = (top: number, bottom: number, right = 800) => ({
  left: 100,
  top,
  bottom,
  right,
});

describe("placeToolbar", () => {
  it("puts the toolbar above the table's right end", () => {
    const element = toolbar();
    placeToolbar(element, table(300, 500));

    expect(element.style.left).toBe("600px");
    expect(element.style.top).toBe(`${300 - 30 - 10}px`);
    expect(element.hidden).toBe(false);
  });

  it("stays below the top bar while the table's top is scrolled away", () => {
    const element = toolbar();
    placeToolbar(element, table(-200, 500));

    expect(element.style.top).toBe("36px");
    expect(element.hidden).toBe(false);
  });

  it("hides while the table is above or below the window", () => {
    const above = toolbar();
    placeToolbar(above, table(-400, 50));
    const below = toolbar();
    placeToolbar(below, table(900, 1200));

    expect(above.hidden).toBe(true);
    expect(below.hidden).toBe(true);
  });

  it("stays inside the window", () => {
    const wide = toolbar(300);
    placeToolbar(wide, table(300, 500, 1200));
    const left = toolbar(300);
    placeToolbar(left, table(300, 500, 100));

    expect(wide.style.left).toBe(`${1024 - 10 - 300}px`);
    expect(left.style.left).toBe("10px");
  });

  it("measures its width at the window's left edge", () => {
    const element = toolbar();
    element.style.left = "900px";
    const measure = vi.mocked(element.getBoundingClientRect);
    measure.mockImplementation(() => {
      expect(element.style.left).toBe("0px");
      return { width: 200, height: 30 } as DOMRect;
    });
    placeToolbar(element, table(300, 500));

    expect(measure).toHaveBeenCalled();
  });
});

describe("placeTip", () => {
  const box = (left: number, top: number, width: number, height = 28) =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    }) as DOMRect;

  it("puts the tooltip above its control, centered on it", () => {
    const element = toolbar(80, 24);
    placeTip(element, box(500, 400, 28), 0);

    expect(element.style.left).toBe(`${514 - 40}px`);
    expect(element.style.top).toBe(`${400 - 6 - 24}px`);
  });

  it("puts it below where the top bar leaves no room", () => {
    const element = toolbar(80, 24);
    placeTip(element, box(500, 40, 28), 0);

    expect(element.style.top).toBe(`${68 + 6}px`);
  });

  it("puts it at the pointer on a wide control", () => {
    const element = toolbar(80, 24);
    placeTip(element, box(100, 400, 600), 300);

    expect(element.style.left).toBe("260px");
  });

  it("keeps it in the window", () => {
    const element = toolbar(80, 24);
    placeTip(element, box(1010, 400, 14), 0);

    expect(element.style.left).toBe(`${1024 - 4 - 80}px`);
  });
});

describe("place at the end", () => {
  const button = (top: number, right: number) => ({
    left: right - 28,
    top,
    bottom: top + 28,
    right,
  });

  it("puts a popover below a button, their right ends in line", () => {
    const element = toolbar(260, 150);
    place(element, button(100, 700), { align: "end" });
    expect(element.style.left).toBe(`${700 - 260}px`);
    expect(element.style.top).toBe(`${128 + 2}px`);
  });

  it("goes above where there's no room below, and stays in the window", () => {
    const element = toolbar(260, 150);
    place(element, button(700, 100), { align: "end" });
    expect(element.style.top).toBe(`${700 - 150 - 2}px`);
    expect(element.style.left).toBe("4px");
  });
});
