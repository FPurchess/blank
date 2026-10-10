import { afterEach, describe, expect, it, vi } from "vitest";

import { type MathModule, setMathModuleLoader } from "../engine/mathModule";
import { parseMarkdown } from "../markdown";
import { drawnMath } from "../state";
import { flushPromises } from "../test/async";
import {
  drawAllMath,
  forgetMathModule,
  loadMathModule,
  mathDrawing,
  mathIn,
} from "./drawings";

const fakeModule = (): MathModule & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    draw: (latex, display) => {
      calls.push(`${display ? "d" : "i"}${latex}`);
      return `{"width":1,"height":1,"depth":0,"ops":[],"latex":${JSON.stringify(latex)}}`;
    },
  };
};

afterEach(() => {
  setMathModuleLoader(null);
  forgetMathModule();
});

describe("formulas drawn by the math module", () => {
  it("loads the module when first asked, then draws what was asked", async () => {
    const module = fakeModule();
    setMathModuleLoader(() => Promise.resolve(module));
    const before = drawnMath.value;
    expect(mathDrawing("x^2", false)).toBeUndefined();
    await flushPromises();
    expect(drawnMath.value).toBe(before + 1);
    expect(module.calls).toEqual(["ix^2"]);
    // drawn once, then kept
    expect(mathDrawing("x^2", false)).toContain('"latex":"x^2"');
    expect(mathDrawing("x^2", false)).toBeDefined();
    expect(module.calls).toEqual(["ix^2"]);
    // display math apart from inline math
    mathDrawing("x^2", true);
    expect(module.calls).toEqual(["ix^2", "dx^2"]);
  });

  it("leaves formulas their source when the module doesn't load, and says so", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    setMathModuleLoader(() => Promise.reject(new TypeError("no wasm")));
    expect(mathDrawing("\\secret", false)).toBeUndefined();
    await flushPromises();
    expect(mathDrawing("\\secret", false)).toBeUndefined();
    // the kind of failure, never the formula
    expect(error).toHaveBeenCalledWith(
      "the math module didn't load",
      "TypeError",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret");
  });

  it("drops a module that traps, and doesn't draw that formula again", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const module = fakeModule();
    const draw = module.draw;
    module.draw = (latex, display) => {
      if (latex === "\\boom") throw new WebAssembly.RuntimeError("unreachable");
      return draw(latex, display);
    };
    setMathModuleLoader(() => Promise.resolve(module));
    await loadMathModule();
    expect(mathDrawing("\\boom", false)).toContain("can't set");
    expect(error).toHaveBeenCalledWith(
      "the math module stopped working",
      "RuntimeError",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("boom");
    // remembered, not drawn again
    const calls = module.calls.length;
    expect(mathDrawing("\\boom", false)).toContain("can't set");
    expect(module.calls.length).toBe(calls);
    // nor are formulas that waited for it
    expect(module.calls).not.toContain("iy");
    // and the module given up: other formulas show their source
    expect(mathDrawing("y", false)).toBeUndefined();
    await flushPromises();
    expect(mathDrawing("y", false)).toBeUndefined();
  });

  it("draws every formula of a document for an export", async () => {
    const module = fakeModule();
    setMathModuleLoader(() => Promise.resolve(module));
    const doc = parseMarkdown("a $x$ b $x$\n\n$$\ny\n$$\n");
    expect(mathIn(doc)).toEqual([
      ["x", false],
      ["y", true],
    ]);
    const drawn = await drawAllMath(doc);
    expect(drawn.map(([latex, display]) => [latex, display])).toEqual([
      ["x", false],
      ["y", true],
    ]);
    expect(await drawAllMath(parseMarkdown("no math"))).toEqual([]);
  });
});
