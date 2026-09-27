import { describe, expect, it, vi } from "vitest";

import { placeToolbar } from "./popup";

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
