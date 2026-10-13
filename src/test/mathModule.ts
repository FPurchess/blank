import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Node } from "prosemirror-model";

import type { PageEngine } from "../engine/engine";
import { setMathModuleLoader } from "../engine/mathModule";
import { draw, initSync } from "../engine/wasm/math/blank_math.js";
import { drawAllMath, forgetMathModule } from "../math/drawings";

const root = resolve(import.meta.dirname, "../..");

/**
 * useTestMathModule loads the real math module from disk, as the app
 * would; setMathModuleLoader(null) and forgetMathModule() undo it
 */
export const useTestMathModule = () => {
  forgetMathModule();
  setMathModuleLoader(() => {
    initSync({
      module: readFileSync(
        resolve(root, "src/engine/wasm/math/blank_math_bg.wasm"),
      ),
    });
    return Promise.resolve({ draw });
  });
};

/**
 * withMathOf gives `engine` the formulas of `doc` as the math module drew
 * them, as the page view does before it lays them out
 */
export const withMathOf = async (engine: PageEngine, doc: Node) => {
  useTestMathModule();
  for (const [latex, display, json] of await drawAllMath(doc)) {
    engine.addMath(latex, display, json);
  }
  return engine;
};
