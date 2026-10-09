import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick, shallowRef } from "vue";

import {
  type PageDisplay,
  type PageEngine,
  setPageEngine,
} from "../engine/engine";
import { printSheets } from "../print/sheets";
import {
  type Painter,
  type PaintOptions,
  painter,
  setPainter,
} from "./painter";
import { PAPER, PAPER_COLORS } from "./painter/canvas2d";
import PrintPreview from "./PrintPreview.vue";

const A4 = { width: 595.28, height: 841.89 };
// the stage's room in CSS pixels: a landscape A4 sheet fills it at half size
const ROOM = { width: 420.945, height: 297.64 };

const original = painter;
let unmount = () => {};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
    ROOM.width,
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(
    ROOM.height,
  );
});

afterEach(() => {
  unmount();
  setPainter(original);
  setPageEngine(null);
  vi.restoreAllMocks();
});

// what the preview painted: the page each canvas shows, and how
const record = () => {
  const painted: { display: PageDisplay; options: PaintOptions }[] = [];
  const fake: Painter = {
    snapshots: false,
    surface: (canvas) => ({ canvas }),
    paint: (_surface, display, options) => painted.push({ display, options }),
    clear: () => {},
    snapshot: async () => null,
    show: () => {},
    release: () => {},
  };
  setPainter(fake);
  // each page's display names its page
  const printDisplay = vi.fn(
    (page: number) => ({ r: [], i: [], l: [], g: [[page]] }) as PageDisplay,
  );
  setPageEngine({ printDisplay } as unknown as PageEngine);
  return { painted, printDisplay };
};

const mount = async (perSheet: 1 | 2) => {
  const sheets = printSheets({
    pages: [0, 1, 2],
    page: A4,
    perSheet,
    scale: "actual",
  });
  const index = shallowRef(0);
  const element = document.createElement("div");
  document.body.append(element);
  const app = createApp({
    render: () =>
      h(PrintPreview, {
        sheets,
        page: A4,
        label: "Sheet",
        modelValue: index.value,
        "onUpdate:modelValue": (next: number) => (index.value = next),
      }),
  });
  app.mount(element);
  unmount = () => {
    app.unmount();
    element.remove();
  };
  await nextTick();
  await nextTick();
  return { sheets, index };
};

const canvases = () => [
  ...document.querySelectorAll<HTMLCanvasElement>(".sheet canvas"),
];

describe("the print preview", () => {
  it("places the pages on the sheet where the print PDF places them", async () => {
    const { painted } = record();
    const { sheets } = await mount(2);

    const [sheet] = sheets;
    // CSS pixels per point
    const k = ROOM.width / sheet.width;
    const shown = document.querySelector<HTMLElement>(".sheet")!;
    expect(parseFloat(shown.style.width)).toBeCloseTo(sheet.width * k);
    expect(canvases()).toHaveLength(2);
    canvases().forEach((canvas, at) => {
      const placement = sheet.placements[at];
      expect(parseFloat(canvas.style.left)).toBeCloseTo(placement.x * k);
      expect(parseFloat(canvas.style.top)).toBeCloseTo(placement.y * k);
    });
    // each page as it prints, scaled as placed, on paper
    expect(painted.map(({ display }) => display.g[0][0])).toEqual([0, 1]);
    for (const [at, { options }] of painted.entries()) {
      expect(options.scale).toBeCloseTo(k * sheet.placements[at].scale);
      expect(options).toMatchObject({
        colors: PAPER_COLORS,
        background: PAPER,
      });
    }
  });

  it("pages through the sheets, painting only the one shown", async () => {
    const { painted, printDisplay } = record();
    const { index } = await mount(1);
    expect(painted).toHaveLength(1);
    const previous = () =>
      document.querySelector<HTMLElement>('[aria-label="Previous sheet"]')!;
    const next = () =>
      document.querySelector<HTMLElement>('[aria-label="Next sheet"]')!;
    expect(previous().getAttribute("aria-disabled")).toBe("true");

    next().click();
    await nextTick();
    await nextTick();
    expect(index.value).toBe(1);
    expect(painted.map(({ display }) => display.g[0][0])).toEqual([0, 1]);

    // the first page's display is read once
    previous().click();
    await nextTick();
    await nextTick();
    expect(index.value).toBe(0);
    expect(printDisplay.mock.calls.map(([page]) => page)).toEqual([0, 1]);

    // there's no sheet before the first
    previous().click();
    await nextTick();
    expect(index.value).toBe(0);
  });
});
