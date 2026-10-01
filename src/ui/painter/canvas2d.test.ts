import { describe, expect, it, vi } from "vitest";

import { paintCalls, recordingContext } from "../../test/canvas";
import { Canvas2DPainter, ROLE_OPACITY } from "./canvas2d";

const DISPLAY = {
  r: [[10, 20, 30, 0.1, 0]],
  i: [["a.png", 0, 0, 5, 5]] as [string, number, number, number, number][],
  l: [],
  g: [[0, 10, 0, 42, 12, 30, 43, 18, 30]],
};

// a painter whose canvas records what is painted
const setUp = () => {
  const glyph = vi.fn(
    (font: number, id: number) => `${font}:${id}` as unknown as Path2D,
  );
  const image = {} as CanvasImageSource;
  const painter = new Canvas2DPainter({
    glyphs: () => ({ glyph, unitsPerEm: () => 1000 }),
    image: () => image,
  });
  const canvas = { width: 200, height: 100 };
  const { context, calls } = recordingContext(canvas);
  const surface = {
    canvas: canvas as unknown as HTMLCanvasElement,
    context,
  };
  return { painter, surface, calls, glyph, image };
};

describe("Canvas2DPainter", () => {
  it("paints glyphs, rectangles and images where the layout put them", () => {
    const { painter, surface, calls, glyph, image } = setUp();
    painter.paint(surface, DISPLAY, {
      scale: 2,
      ratio: 1,
      x: 10,
      y: 10,
      color: "black",
    });
    // it starts from an empty canvas
    expect(calls).toContainEqual(["clear", 0, 0, 200, 100]);
    // a hairline stays a pixel thick
    expect(calls).toContainEqual(["rect", 0, 20, 60, 1]);
    expect(calls).toContainEqual(["image", image, -20, -20, 10, 10]);
    // each glyph: one em of 10 pt at 2 px per point, y up, at its spot
    expect(calls).toContainEqual(["transform", 0.02, 0, 0, -0.02, 4, 40]);
    expect(calls).toContainEqual(["transform", 0.02, 0, 0, -0.02, 16, 40]);
    expect(glyph).toHaveBeenCalledWith(0, 43);
    // in the theme's colour, the rectangle and the glyphs as their roles are
    // (text at full opacity)
    const styles = calls.filter((call) => call[0] === "style");
    expect(styles).toContainEqual(["style", "black", ROLE_OPACITY[0]]);
    expect(styles.every((call) => call[1] === "black")).toBe(true);
  });

  it("paints nothing without an engine", () => {
    const canvas = { width: 10, height: 10 };
    const { context, calls } = recordingContext(canvas);
    const painter = new Canvas2DPainter({
      glyphs: () => null,
      image: () => null,
    });
    painter.paint(
      { canvas: canvas as unknown as HTMLCanvasElement, context } as never,
      DISPLAY,
      { scale: 1, ratio: 1, x: 0, y: 0, color: "black" },
    );
    expect(calls).toEqual([]);
  });

  it("takes the surface of a canvas, and shows a snapshot on it", async () => {
    const { painter } = setUp();
    const canvas = document.createElement("canvas");
    const surface = painter.surface(canvas)!;
    expect(surface.canvas).toBe(canvas);
    // jsdom has no ImageBitmap, so nothing is kept
    expect(painter.snapshots).toBe(false);
    expect(await painter.snapshot(surface)).toBeNull();
    const recorded = setUp();
    const bitmap = {} as ImageBitmap;
    recorded.painter.show(recorded.surface, {
      bitmap,
      width: 200,
      height: 100,
    } as never);
    expect(recorded.calls).toEqual([
      ["transform", 1, 0, 0, 1, 0, 0],
      ["clear", 0, 0, 200, 100],
      ["image", bitmap, 0, 0],
    ]);
  });

  it("keeps an ImageBitmap of the canvas where there are bitmaps", async () => {
    const bitmap = { close: vi.fn() };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap),
    );
    try {
      const { painter, surface } = setUp();
      expect(painter.snapshots).toBe(true);
      const snapshot = (await painter.snapshot(surface))!;
      expect(snapshot).toMatchObject({ width: 200, height: 100 });
      snapshot.close?.();
      expect(bitmap.close).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("frees a canvas' pixels when its surface is released", () => {
    const { painter } = setUp();
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    painter.release(painter.surface(canvas)!);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it("paints the selected text only within the selection, over its fill", () => {
    const { painter, surface, calls } = setUp();
    painter.paint(surface, DISPLAY, {
      scale: 2,
      ratio: 1,
      x: 10,
      y: 10,
      color: "white",
      within: [{ x: 12, y: 18, width: 10, height: 5 }],
      fill: "blue",
    });
    const order = calls.map((call) => call[0]);
    // clipped to the rectangle, in device pixels, filled, then the text,
    // and the clip taken away again
    expect(calls).toContainEqual(["clipRect", 4, 16, 20, 10]);
    expect(order.indexOf("clip")).toBeLessThan(order.indexOf("fill"));
    expect(order[order.length - 1]).toBe("restore");
  });

  it("records only what a canvas shows since its size was set", () => {
    const canvas = document.createElement("canvas");
    canvas.getContext("2d")!.fillRect(0, 0, 1, 1);
    expect(paintCalls(canvas)).not.toEqual([]);
    canvas.width = 10;
    expect(paintCalls(canvas)).toEqual([]);
  });
});
