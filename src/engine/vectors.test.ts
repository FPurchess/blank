import { afterEach, describe, expect, it, vi } from "vitest";

import { fallbackFonts, findFonts, forgetFallbacks } from "./fallback";
import { drawnVectors } from "../state/drawings";
import { useTestDiagramModule } from "../test/diagramModule";

import {
  type DiagramModule,
  diagramModule,
  setDiagramModuleLoader,
} from "./diagramModule";
vi.mock("./fallback", async (original) => ({
  ...(await original<typeof import("./fallback")>()),
  findFonts: vi.fn(async () => []),
}));

import {
  drawAll,
  drawingOf,
  drawingRevision,
  forgetVector,
  forgetVectors,
  inked,
  putVector,
  VECTOR,
} from "./vectors";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="ink(0.4)" width="10" height="10"/><text>ink(1)</text></svg>';
const key = `${VECTOR}diagram:1`;

const fakeModule = (
  draw: (svg: string) => string | undefined,
  missing: () => string = () => "",
) => {
  const module: DiagramModule = {
    addFont: vi.fn(),
    draw: vi.fn(draw),
    missing: vi.fn(missing),
  };
  setDiagramModuleLoader(async () => module);
  return module;
};

describe("drawings of Blank's", () => {
  afterEach(() => {
    forgetVectors();
    forgetFallbacks();
    setDiagramModuleLoader(null);
    vi.restoreAllMocks();
  });

  it("put their ink in a colour, and leave the text of labels alone", () => {
    expect(inked(SVG, "rgb(10,20,30)")).toContain('fill="rgba(10,20,30,0.4)"');
    expect(inked(SVG, "#ffffff")).toContain("<text>ink(1)</text>");
  });

  it("are drawn by the diagram module in a colour it takes as the ink", async () => {
    const module = fakeModule(() => '{"width":10,"height":10,"ops":[]}');
    const before = drawnVectors.value;
    putVector(key, { svg: SVG, width: 10, height: 10 });
    await drawAll([key]);
    expect(module.draw).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('fill="rgba(1,2,3,0.4)"'),
    );
    expect(drawingOf(key)).toBe('{"width":10,"height":10,"ops":[]}');
    expect(drawnVectors.value).toBe(before + 1);
    // once each
    await drawAll([key]);
    expect(module.draw).toHaveBeenCalledOnce();
    forgetVector(key);
    expect(drawingOf(key)).toBeUndefined();
  });

  it("stay pictures when the module can't draw one, and say so", async () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});
    fakeModule(() => undefined);
    putVector(key, { svg: SVG, width: 10, height: 10 });
    await drawAll([key]);
    expect(drawingOf(key)).toBeUndefined();
    expect(logged).toHaveBeenCalledWith(
      "the diagram module couldn't draw a diagram",
    );
  });

  it("stay pictures when the module doesn't load, which is tried again later", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn(async (): Promise<DiagramModule> => {
      throw new TypeError("failed to fetch");
    });
    setDiagramModuleLoader(load);
    putVector(key, { svg: SVG, width: 10, height: 10 });
    await drawAll([key]);
    expect(drawingOf(key)).toBeUndefined();
    // the kind of the error only, never what the diagram says
    expect(logged).toHaveBeenCalledWith(
      "the diagram module didn't load",
      "TypeError",
    );
    // not again at once
    await expect(diagramModule()).rejects.toThrow();
    expect(load).toHaveBeenCalledOnce();
  });

  it("are drawn again once the system has a font for characters of their labels", async () => {
    let found = false;
    const module = fakeModule(
      () => (found ? '{"found":1}' : '{"found":0}'),
      () => (found ? "" : "日本語"),
    );
    vi.mocked(findFonts).mockImplementation(async () => {
      found = true;
      const font = { family: "Noto Sans CJK JP", bytes: new Uint8Array() };
      fallbackFonts.value = [...fallbackFonts.value, font];
      return [font];
    });
    putVector(key, { svg: SVG, width: 10, height: 10 });
    await drawAll([key]);
    expect(findFonts).toHaveBeenCalledWith("日本語", expect.any(String));
    expect(module.draw).toHaveBeenCalledTimes(2);
    expect(drawingOf(key)).toBe('{"found":1}');
    expect(drawingRevision(key)).toBeDefined();
  });

  it("are drawn again when another lookup found the font meanwhile", async () => {
    let fonts = 0;
    const module = fakeModule(
      () => `{"fonts":${fonts}}`,
      () => (fonts ? "" : "日本語"),
    );
    // the document's own lookup for the same characters added the font
    // first, so this one finds them looked for and returns none
    vi.mocked(findFonts).mockImplementation(async () => {
      fonts = 1;
      fallbackFonts.value = [
        ...fallbackFonts.value,
        { family: "Noto Sans CJK JP", bytes: new Uint8Array() },
      ];
      return [];
    });
    putVector(key, { svg: SVG, width: 10, height: 10 });
    await drawAll([key]);
    expect(module.draw).toHaveBeenCalledTimes(2);
    expect(drawingOf(key)).toBe('{"fonts":1}');
  });

  it("give the module up when it traps, and stay pictures", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const module = fakeModule(() => {
      throw new WebAssembly.RuntimeError("unreachable");
    });
    putVector(key, { svg: SVG, width: 10, height: 10 });
    await expect(drawAll([key])).resolves.toBeDefined();
    expect(drawingOf(key)).toBeUndefined();
    expect(logged).toHaveBeenCalledWith(
      "the diagram module stopped working",
      "RuntimeError",
    );
    // not used, nor loaded, again: its glue would give the broken instance
    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    await expect(diagramModule()).rejects.toThrow();
    vi.useRealTimers();
    expect(module.draw).toHaveBeenCalledOnce();
  });

  it("draw one forgotten and put again while it was being drawn", async () => {
    let release: () => void = () => {};
    const module = fakeModule(() => "{}");
    setDiagramModuleLoader(
      () => new Promise((resolve) => (release = () => resolve(module))),
    );
    putVector(key, { svg: SVG, width: 10, height: 10 });
    const first = drawAll([key]);
    forgetVector(key);
    putVector(key, { svg: SVG, width: 10, height: 10 });
    const second = drawAll([key]);
    release();
    await Promise.all([first, second]);
    expect(drawingOf(key)).toBe("{}");
  });

  it("keep an author's own black, and take Blank's ink as the ink (the real module)", async () => {
    useTestDiagramModule();
    putVector(key, {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="5" height="5" fill="ink(1)"/><rect x="5" width="5" height="5" fill="#000"/></svg>',
      width: 10,
      height: 10,
    });
    await drawAll([key]);
    const ops = JSON.parse(drawingOf(key)!).ops;
    expect(ops.map((op: { paint: unknown }) => op.paint)).toEqual([
      { alpha: 1 },
      { alpha: 1, color: [0, 0, 0] },
    ]);
  });

  it("aren't drawn again when no font has them", async () => {
    const module = fakeModule(
      () => "{}",
      () => "𓀀",
    );
    vi.mocked(findFonts).mockResolvedValue([]);
    putVector(key, { svg: SVG, width: 10, height: 10 });
    await drawAll([key]);
    expect(module.draw).toHaveBeenCalledOnce();
  });
});
